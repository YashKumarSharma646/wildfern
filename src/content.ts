export const NAV_LINKS = [
  { id: 'story', label: 'Our Story' },
  { id: 'menu', label: 'The Menu' },
  { id: 'space', label: 'The Space' },
  { id: 'reservations', label: 'Reservations' },
] as const

export interface MenuItem {
  id: string
  name: string
  description: string
  price: string
  notes: string[]
  serve: string
  image: string
  alt: string
}

/* Fictional signature drinks. Prices are placeholders. */
export const MENU: MenuItem[] = [
  {
    id: 'forest-bloom',
    name: 'Forest Bloom',
    description: 'A floral espresso with delicate honey notes, pulled short over wildflower honey from hives at the forest edge.',
    price: '$7.50',
    notes: ['Elderflower', 'Raw honey', 'Stone fruit'],
    serve: 'Served in hand-thrown stoneware',
    image: '/images/forest-bloom.webp',
    alt: 'An espresso drink with heart latte art in a pale blue cup and saucer',
  },
  {
    id: 'wildflower-latte',
    name: 'Wildflower Latte',
    description: 'A silky latte with a hint of botanical sweetness, steamed with a house syrup of meadowsweet and chamomile.',
    price: '$6.80',
    notes: ['Meadowsweet', 'Chamomile', 'Velvet milk'],
    serve: 'Oat, whole or almond milk',
    image: '/images/wildflower-latte.webp',
    alt: 'A latte with rosetta latte art in a white cup on a wooden table',
  },
  {
    id: 'moss-matcha',
    name: 'Moss & Matcha',
    description: 'Ceremonial-style matcha whisked by hand, softened with creamy milk and a whisper of pine.',
    price: '$7.20',
    notes: ['Umami', 'Pine needle', 'Sweet cream'],
    serve: 'Whisked to order, served warm or over ice',
    image: '/images/moss-matcha.webp',
    alt: 'A green matcha latte with leaf latte art in a white cup on a dark table',
  },
]

/** What the songbird says when you tap a word in the hero, in order. */
export const GREETINGS = [
  'Hey buddy! What are you up to today?',
  'Oh, hi again! Fancy a warm cup? The café is just down the trail.',
  'Psst… the best seat is out on the terrace.',
  'Tweet tweet! Scroll on — I’ll race you to the Glasshouse.',
]
