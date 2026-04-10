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

### Key Technical Notes

- **Odoo 16 / Owl 2 pattern**: `odoo.define(...)` with `Registries.Component.extend` / `Registries.Model.extend`.
- **`AbstractAwaitablePopup` in Owl 2**: `confirm(payload)` ignores its argument — payload is returned via `getPayload()` override.
- **`merge: false`**: Passed to `order.add_product()` to guarantee clearance lines are never merged with other lines.
- **Smart re-tap handling**: If a clearance line for the same product already exists in the order, quantity is incremented on it rather than adding a new line.
- **`full_product_name`**: Set on the clearance line so the tag text is carried through to the Sales Order line description.
- **Expiry dates**: Fetched from `stock.lot.expiration_date` at POS session start; gracefully skipped if the expiry tracking module isn't installed.

---

## Configuration

### System Parameter
In Odoo: **Settings → Technical → Parameters → System Parameters**

| Key | Value |
|-----|-------|
| `worthy_pos_clearance.clearance_location_id` | The numeric ID of your clearance stock location (e.g. `15125`) |

### Clearance Location
Create a dedicated internal location (e.g. `WPW01/CLEARANCE`) and transfer clearance-priced stock there. The module queries `stock.quant` on POS session start and maps quantities + expiry dates per product.

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
- [ ] **Receipt / invoice label** — ensure the clearance tag prints clearly on customer-facing documents
- [ ] **Multi-location clearance** — support multiple clearance locations across warehouses
- [ ] **Admin UI** — POS configuration field for clearance location instead of raw system parameter
- [ ] **Clearance badge colour config** — allow colour/label customisation per POS config

---

## Version History

| Version | Notes |
|---------|-------|
| 16.0.1.0.0 | Initial scaffold |
| 16.0.1.1.0–16.0.1.4.0 | Badge, popup, PosStore iterations |
| 16.0.1.5.0 | Switched interception to `_getAddProductOptions` to avoid Wedoo double-fire |
| 16.0.1.6.0 | **Current** — `_clickProduct` with `merge: false`; expiry date support; `getPayload()` fix; StockRule routing |
