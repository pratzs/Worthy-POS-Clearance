odoo.define('worthy_pos_clearance.ClearancePopup', function (require) {
    'use strict';

    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');

    class ClearancePopup extends AbstractAwaitablePopup {
        // In Odoo 16, we must expose the payload via this specific function
        getPayload() {
            return this.selectedChoice;
        }

        chooseNormal() {
            this.selectedChoice = 'normal';
            this.confirm();
        }

        chooseClearance() {
            this.selectedChoice = 'clearance';
            this.confirm();
        }
    }
    
    ClearancePopup.template = 'ClearancePopup';
    ClearancePopup.defaultProps = { confirmText: 'Confirm', cancelText: 'Cancel', title: 'Which stock?' };
    
    Registries.Component.add(ClearancePopup);
    return ClearancePopup;
});