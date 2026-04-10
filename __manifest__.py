{
    'name': 'Worthy POS Clearance Stock',
    'version': '16.0.1.6.0',
    'summary': 'Show clearance stock qty on POS tiles and allow separate clearance order lines',
    'description': """
        Zero-Python module — no server restart required.

        Configuration:
          Settings > Technical > Parameters > System Parameters
          Key:   worthy_pos_clearance.clearance_location_id
          Value: <internal location ID, e.g. 15125>

        What it does:
          - Reads clearance stock quantities from that location at POS session start
          - Shows a red "Clearance: X" badge on any product tile that has clearance stock
          - When a rep taps that product a popup asks: Normal Stock or Clearance Stock?
          - Clearance choice creates a separate order line (never merges) so the rep
            can apply a different manual discount independently
    """,
    'category': 'Point of Sale',
    'author': 'Worthy Oceania',
    'website': 'https://worthyoceania.co.nz',
    'depends': ['point_of_sale', 'stock'],
    'data': [],
    'assets': {
        'point_of_sale.assets': [
            'worthy_pos_clearance/static/src/css/clearance.css',
            'worthy_pos_clearance/static/src/xml/ProductCardPatch.xml',
            'worthy_pos_clearance/static/src/xml/ClearancePopup.xml',
            'worthy_pos_clearance/static/src/js/PosStorePatch.js',
            'worthy_pos_clearance/static/src/js/ProductCardPatch.js',
            'worthy_pos_clearance/static/src/js/ClearancePopup.js',
            'worthy_pos_clearance/static/src/js/ProductScreenPatch.js',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
