from odoo import models # type: ignore

class StockRule(models.Model):
    _inherit = 'stock.rule'

    def _get_stock_move_values(self, product_id, product_qty, product_uom, location_id, name, origin, company_id, values):
        # 1. Get the standard Odoo delivery values first
        move_values = super()._get_stock_move_values(product_id, product_qty, product_uom, location_id, name, origin, company_id, values)
        
        # 2. Check if this specific movement comes from a Sale Order Line
        sale_line_id = values.get('sale_line_id')
        if sale_line_id:
            sale_line = self.env['sale.order.line'].browse(sale_line_id)
            
            # 3. Odoo merges POS notes into the 'name' (Description) field on Sales Orders.
            # We check that description text for our clearance tag.
            description = sale_line.name or ''
            
            if 'CLEARANCE ITEM' in description.upper():
                
                # 4. Dynamically find the Clearance location
                clearance_location = self.env['stock.location'].search([
                    ('name', 'ilike', 'Clearance'), 
                    ('usage', '=', 'internal')
                ], limit=1)
                
                if clearance_location:
                    # 5. Override the source location for the warehouse pickers!
                    move_values['location_id'] = clearance_location.id
                    
        return move_values