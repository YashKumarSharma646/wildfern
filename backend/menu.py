"""The signature menu served by GET /api/menu (fictional drinks; prices are placeholders)."""

MENU = [
    {
        "id": "forest-bloom",
        "name": "Forest Bloom",
        "description": "A floral espresso with delicate honey notes, pulled short over wildflower honey from hives at the forest edge.",
        "price": "$7.50",
        "notes": ["Elderflower", "Raw honey", "Stone fruit"],
        "serve": "Served in hand-thrown stoneware",
        "image": "/images/forest-bloom.webp",
        "alt": "An espresso drink with heart latte art in a pale blue cup and saucer",
    },
    {
        "id": "wildflower-latte",
        "name": "Wildflower Latte",
        "description": "A silky latte with a hint of botanical sweetness, steamed with a house syrup of meadowsweet and chamomile.",
        "price": "$6.80",
        "notes": ["Meadowsweet", "Chamomile", "Velvet milk"],
        "serve": "Oat, whole or almond milk",
        "image": "/images/wildflower-latte.webp",
        "alt": "A latte with rosetta latte art in a white cup on a wooden table",
    },
    {
        "id": "moss-matcha",
        "name": "Moss & Matcha",
        "description": "Ceremonial-style matcha whisked by hand, softened with creamy milk and a whisper of pine.",
        "price": "$7.20",
        "notes": ["Umami", "Pine needle", "Sweet cream"],
        "serve": "Whisked to order, served warm or over ice",
        "image": "/images/moss-matcha.webp",
        "alt": "A green matcha latte with leaf latte art in a white cup on a dark table",
    },
]
