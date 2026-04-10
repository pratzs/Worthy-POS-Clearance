odoo.define('worthy_pos_clearance.ProductScreenPatch', function (require) {
    'use strict';

    const ProductScreen = require('point_of_sale.ProductScreen');
    const Registries = require('point_of_sale.Registries');

    const ProductScreenPatch = (ProductScreen) => class extends ProductScreen {
        async _clickProduct(event) {
            const product = event.detail;
            const clearanceQty = this.env.pos.getClearanceQty(product.id);
            const clearanceDates = this.env.pos.getClearanceDates(product.id); // Fetch the expiry dates

            if (clearanceQty > 0) {
                const { confirmed, payload } = await this.showPopup('ClearancePopup', {
                    productName: product.display_name,
                    clearanceQty: clearanceQty,
                });

                if (!confirmed) return;

                if (payload === 'clearance') {
                    const order = this.env.pos.get_order();
                    
                    // Dynamically build the note text so we can match it perfectly in the cart
                    let noteText = "⚠️ CLEARANCE ITEM";
                    if (clearanceDates) {
                        noteText += ` (Exp: ${clearanceDates})`;
                    }
                    
                    // 1. Look inside the cart to see if a Clearance line for this exact product AND note already exists
                    const existingLines = order.get_orderlines();
                    const existingClearanceLine = existingLines.find(
                        line => line.product.id === product.id && line.get_customer_note() === noteText
                    );

                    if (existingClearanceLine) {
                        // 2. If it exists, just increase the quantity by 1 (Manual Merge)
                        existingClearanceLine.set_quantity(existingClearanceLine.get_quantity() + 1);
                    } else {
                        // 3. If it doesn't exist, natively force a brand-new order line
                        order.add_product(product, { quantity: 1, merge: false });
                        
                        // Attach the visible warning note (WITH DATES) to the newly created line
                        const newLine = order.get_selected_orderline();
                        if (newLine) {
                            // 1. Keeps the visual note in the POS cart UI
                            newLine.set_customer_note(noteText);
                            
                            // 2. NEW FIX: Overwrite the core product name in the JSON payload
                            // This guarantees standard Odoo carries the text onto the Sales Order line
                            newLine.full_product_name = product.display_name + " - " + noteText;
                        }
                    }
                    return;
                }
            }
            
            // Standard flow if "Normal" was clicked or no clearance stock exists
            await super._clickProduct(event);
        }
    };

    Registries.Component.extend(ProductScreen, ProductScreenPatch);
});