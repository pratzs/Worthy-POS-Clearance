odoo.define('worthy_pos_clearance.PosStorePatch', function (require) {
    'use strict';

    const { PosGlobalState } = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');

    const PosStorePatch = (PosGlobalState) => class extends PosGlobalState {
        async _processData(loadedData) {
            await super._processData(...arguments);
            this.clearanceQtys = {};
            this.clearanceDates = {}; // NEW: Store expiry dates
            
            try {
                const locationParam = await this.env.services.rpc({
                    model: 'ir.config_parameter',
                    method: 'get_param',
                    args: ['worthy_pos_clearance.clearance_location_id'],
                });

                if (!locationParam) return;
                const locationId = parseInt(locationParam, 10);
                if (!locationId || isNaN(locationId)) return;

                // 1. Fetch stock and get the lot_id
                const quants = await this.env.services.rpc({
                    model: 'stock.quant',
                    method: 'search_read',
                    domain: [['location_id', 'child_of', locationId], ['quantity', '>', 0]],
                    fields: ['product_id', 'quantity', 'lot_id'],
                });

                // 2. Extract unique Lot IDs
                const lotIds = [...new Set(quants.filter(q => q.lot_id).map(q => q.lot_id[0]))];
                let lotDates = {};

                // 3. Fetch the Expiry Dates from stock.lot
                if (lotIds.length > 0) {
                    try {
                        const lots = await this.env.services.rpc({
                            model: 'stock.lot',
                            method: 'search_read',
                            domain: [['id', 'in', lotIds]],
                            fields: ['id', 'expiration_date'],
                        });
                        for (const lot of lots) {
                            if (lot.expiration_date) {
                                // Odoo returns "YYYY-MM-DD HH:MM:SS", we just want the date
                                lotDates[lot.id] = lot.expiration_date.split(' ')[0];
                            }
                        }
                    } catch (e) {
                        console.warn("Expiry dates module not installed or accessible", e);
                    }
                }

                // 4. Map everything to the products
                const qtys = {};
                const dates = {};
                for (const quant of quants) {
                    const pid = quant.product_id[0];
                    qtys[pid] = Math.round(((qtys[pid] || 0) + quant.quantity) * 100) / 100;
                    
                    if (quant.lot_id && lotDates[quant.lot_id[0]]) {
                        if (!dates[pid]) dates[pid] = new Set();
                        dates[pid].add(lotDates[quant.lot_id[0]]);
                    }
                }
                
                this.clearanceQtys = qtys;
                // Convert Sets to comma-separated strings (e.g., "2026-12-31, 2027-01-15")
                for (const pid in dates) {
                    this.clearanceDates[pid] = Array.from(dates[pid]).join(', ');
                }

            } catch (err) {
                console.warn("Worthy POS Clearance: failed to load", err);
                this.clearanceQtys = {};
                this.clearanceDates = {};
            }
        }

        getClearanceQty(productId) { return this.clearanceQtys[productId] || 0; }
        hasClearanceStock(productId) { return (this.clearanceQtys[productId] || 0) > 0; }
        
        // NEW: Function to get the date string
        getClearanceDates(productId) { return this.clearanceDates[productId] || ''; }
    };

    Registries.Model.extend(PosGlobalState, PosStorePatch);
});