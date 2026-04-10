# Worthy POS Clearance (`worthy_pos_clearance`)

A custom Odoo 16 Point of Sale module for **Worthy Oceania** that gives sales reps full visibility of clearance stock — including expiry dates — and lets them add clearance items as **separate, independently-discountable order lines** that automatically pull from the correct warehouse location.

---

## What It Does

### 🔴 Clearance Badge on Product Tiles
Any product with stock in the designated clearance location shows a red badge on its POS product card:

```
🔴 Clearance: 5
Exp: 2026-12-31
```

Reps get instant at-a-glance visibility of clearance stock and expiry dates without leaving the product grid.

### Popup on Tap
When a rep taps a product with clearance stock, a choice popup appears:

| Button | What happens |
|--------|-------------|
| 📦 Normal Stock | Standard Odoo flow — adds a normal order line |
| 🔴 Clearance Stock | Adds a **separate** order line tagged `⚠️ CLEARANCE ITEM (Exp: YYYY-MM-DD)` |
| Cancel | Dismisses without adding anything |

### Separate Clearance Lines with Smart Merge
Clearance lines are created with `merge: false` so they never merge with normal stock lines. If the rep taps the same clearance product again, the existing clearance line's quantity is incremented rather than creating a duplicate.

### Automatic Clearance Location Routing (Python)
When a POS sale is pushed to a Sales Order and confirmed, a `StockRule` override automatically re-routes clearance line stock movements to pull from the clearance location (searched by name `'Clearance'`), rather than the default warehouse location.

### Automated Action: Delivery Move Line Routing + Quant Fix
An Odoo Automated Action runs on `stock.move.line` (trigger: On Creation & Update, field: `location_id`) and does two things:

1. **Routing** — ensures clearance SO lines are sourced from `WPW01/Pick/Clearance` and normal lines are never accidentally sourced from the clearance bin (Odoo's FEFO algorithm can steal clearance lots for normal lines).
2. **Quant reservation fix** — after re-routing, explicitly calls `stock.quant._update_reserved_quantity()` to transfer the `reserved_quantity` counter from the old location's quant to the new one. Without this, Odoo's `write()` on `stock.move.line` called from an automated action does not reliably update quant reservations, which causes a **"cannot unreserve more products than you have in stock"** error when validating the delivery.

---

## Architecture

| File | Purpose |
|------|---------|
| `models/stock_rule.py` | Overrides `_get_stock_move_values` to route clearance SO lines to the clearance location |
| `static/src/js/PosStorePatch.js` | On POS load: reads clearance location from system parameters, queries `stock.quant` and `stock.lot` for qty + expiry dates per product |
| `static/src/js/ProductScreenPatch.js` | Overrides `_clickProduct` to intercept product taps, show the popup, and create separate tagged order lines |
| `static/src/js/ClearancePopup.js` | Owl 2 popup component — stores user choice via `getPayload()` |
| `static/src/xml/ClearancePopup.xml` | OWL template for the popup UI |
| `static/src/xml/ProductCardPatch.xml` | Extends `point_of_sale.ProductItem` to show clearance badge + expiry date |
| `static/src/css/clearance.css` | Styles for badge and popup buttons |

### Automated Action (configured in Odoo, not in this repo)

- **Model**: `stock.move.line`
- **Trigger**: On Creation & Update
- **Trigger field**: `location_id`
- **Action type**: Execute Python Code

```python
if record.move_id and record.move_id.sale_line_id:
    desc = record.move_id.sale_line_id.name or ''
    is_clearance_line = 'CLEARANCE ITEM' in desc.upper()

    clearance_loc = env['stock.location'].search([
        ('complete_name', 'ilike', 'WPW01/Pick/Clearance'),
        ('usage', '=', 'internal')
    ], limit=1)

    if clearance_loc:
        needs_reroute = (
            (is_clearance_line and record.location_id.id != clearance_loc.id) or
            (not is_clearance_line and record.location_id.id == clearance_loc.id)
        )

        if needs_reroute:
            old_location = record.location_id
            old_lot = record.lot_id
            old_reserved = record.reserved_uom_qty

            if is_clearance_line:
                new_location = clearance_loc
                new_lot = old_lot
                record.write({'location_id': new_location.id})
            else:
                normal_quant = env['stock.quant'].search([
                    ('product_id', '=', record.product_id.id),
                    ('location_id.complete_name', 'ilike', 'WPW01/Pick'),
                    ('location_id.id', '!=', clearance_loc.id),
                    ('quantity', '>', 0)
                ], limit=1)

                if normal_quant:
                    new_location = normal_quant.location_id
                    new_lot = normal_quant.lot_id if normal_quant.lot_id else old_lot
                    record.write({
                        'location_id': new_location.id,
                        'lot_id': new_lot.id if new_lot else False
                    })
                else:
                    parent_pick = env['stock.location'].search(
                        [('complete_name', 'ilike', 'WPW01/Pick')], limit=1
                    )
                    if parent_pick:
                        new_location = parent_pick
                        new_lot = False
                        record.write({'location_id': new_location.id, 'lot_id': False})

            # Fix quant reservations explicitly.
            # Odoo's write() on stock.move.line called from an automated action does
            # not reliably transfer reserved_quantity between quants, causing a
            # "cannot unreserve more products than you have in stock" error on delivery
            # validation. This block checks and corrects both sides of the transfer.
            if old_reserved and old_reserved > 0:
                old_quant = env['stock.quant'].search([
                    ('product_id', '=', record.product_id.id),
                    ('location_id', '=', old_location.id),
                    ('lot_id', '=', old_lot.id if old_lot else False),
                ], limit=1)
                if old_quant and old_quant.reserved_quantity >= old_reserved:
                    env['stock.quant']._update_reserved_quantity(
                        record.product_id,
                        old_location,
                        -old_reserved,
                        lot_id=old_lot if old_lot else env['stock.lot'],
                        strict=False,
                    )

                new_quant = env['stock.quant'].search([
                    ('product_id', '=', record.product_id.id),
                    ('location_id', '=', new_location.id),
                    ('lot_id', '=', new_lot.id if new_lot else False),
                ], limit=1)
                if new_quant and new_quant.reserved_quantity < old_reserved:
                    env['stock.quant']._update_reserved_quantity(
                        record.product_id,
                        new_location,
                        old_reserved,
                        lot_id=new_lot if new_lot else env['stock.lot'],
                        strict=False,
                    )
```

### Key Technical Notes

- **Odoo 16 / Owl 2 pattern**: `odoo.define(...)` with `Registries.Component.extend` / `Registries.Model.extend`.
- **`AbstractAwaitablePopup` in Owl 2**: `confirm(payload)` ignores its argument — payload is returned via `getPayload()` override. This was a critical bug (`payload=null`) that was fixed by storing the user's choice in `this.selectedChoice` and returning it from `getPayload()`.
- **`merge: false`**: Passed to `order.add_product()` to guarantee clearance lines are never merged with other lines.
- **Smart re-tap handling**: If a clearance line for the same product already exists in the order, quantity is incremented on it rather than adding a new line.
- **`full_product_name`**: Set on the clearance line so the tag text is carried through to the Sales Order line description → invoice.
- **Expiry dates**: Fetched from `stock.lot.expiration_date` at POS session start; gracefully skipped if the expiry tracking module isn't installed.
- **FEFO conflict**: Odoo's First Expired First Out logic reserves clearance lots (e.g. FEB26) for normal lines because they expire soonest. The automated action detects this and re-routes normal lines to non-clearance bins.
- **Wedoo compatibility**: Wedoo has its own `_clickProduct` override. The module extends `_clickProduct` (not `_getAddProductOptions`) to ensure it fires correctly without double-triggering.

---

## Configuration

### System Parameter
In Odoo: **Settings → Technical → Parameters → System Parameters**

| Key | Value |
|-----|-------|
| `worthy_pos_clearance.clearance_location_id` | The numeric ID of your clearance stock location (e.g. `15125`) |

### Clearance Location
Create a dedicated internal location (e.g. `WPW01/PICK/Clearance`) and transfer clearance-priced stock there. The module queries `stock.quant` on POS session start and maps quantities + expiry dates per product.

### Automated Action
The automated action is configured directly in Odoo (not deployed via this module). To set it up on a fresh environment:

1. Go to **Settings → Technical → Automation → Automated Actions**
2. Create a new action:
   - **Model**: Stock Move Line (`stock.move.line`)
   - **Trigger**: On Creation & Update
   - **When updated**: `location_id`
   - **Action**: Execute Python Code
3. Paste the Python code from the section above

---

## Deployment

### Environments
- **Test**: `odootest.worthyoceania.co.nz`
- **Production**: `odoo.worthyoceania.co.nz`

### Steps
1. Zip the `worthy_pos_clearance` folder (the folder itself must be the root entry — not a parent folder).
2. In Odoo → **Apps → Upload Module** → upload the zip.
3. If already installed: click **Upgrade**. Otherwise: click **Install**.
4. Reload the POS session. No server restart required for JS/XML changes.
5. For Python model changes (`models/stock_rule.py`): a server restart **is** required after upgrade.

---

## Development Workflow

```bash
# Clone the repo
git clone https://github.com/pratzs/Worthy-POS-Clearance.git
cd Worthy-POS-Clearance

# Make your changes to the module files
# ...

# Commit and push
git add -A
git commit -m "describe your change"
git push
```

To test changes:
1. Zip the folder and upload via Odoo Apps → Upload Module → Upgrade
2. Hard-refresh the POS (Ctrl+Shift+R) to clear cached JS/CSS
3. Verify in the browser console that the new version's code is running

---

## Roadmap / Planned

- [ ] **Clearance qty enforcement** — prevent reps from adding more clearance units than physically available
- [ ] **Automatic clearance price** — optionally pre-fill a discounted price when a clearance line is created
- [ ] **Receipt / invoice label** — ensure the clearance tag prints clearly on customer-facing documents (emoji `⚠️` may render as a box in some PDF fonts — may need fallback to `** CLEARANCE ITEM **`)
- [ ] **Multi-location clearance** — support multiple clearance locations across warehouses
- [ ] **Admin UI** — POS configuration field for clearance location instead of raw system parameter
- [ ] **Clearance badge colour config** — allow colour/label customisation per POS config
- [ ] **Bundle automated action into module** — deploy via `data/automated_action.xml` so it installs automatically with the module

---

## Version History

| Version | Notes |
|---------|-------|
| 16.0.1.0.0 | Initial scaffold |
| 16.0.1.1.0–16.0.1.4.0 | Badge, popup, PosStore iterations |
| 16.0.1.5.0 | Switched interception to `_getAddProductOptions` to avoid Wedoo double-fire |
| 16.0.1.6.0 | **Current** — `_clickProduct` with `merge: false`; expiry date support; `getPayload()` fix for Owl 2 `payload=null` bug; StockRule routing; automated action with quant reservation fix |
