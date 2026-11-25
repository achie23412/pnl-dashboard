// Words a clothing search can be made of. Season Board keeps a keyword only when every
// word is a known fashion word (this list, or a word from the stores' live product titles).
// That drops brand searches ("amiri jeans", "ariat boots") and off-topic ones ("chevy
// blazer", "boots pharmacy") without keeping a brand list up to date by hand.
const WORDS = `
women womens woman womans ladies lady men mens man gents girls boys unisex female male her his for with and without the a an of in on to by from or at
plus size sizes petite tall maternity curvy big small large xl xxl xs oversized oversize fitted slim skinny regular relaxed loose baggy wide straight tapered bootcut flare flared cropped crop high low mid rise waisted waist length long short midi maxi mini knee ankle thigh calf full half sleeve sleeves sleeveless longline
black white cream ivory beige camel tan brown chocolate grey gray charcoal navy blue light dark denim indigo teal green olive khaki sage mint emerald forest red burgundy wine maroon pink blush rose fuchsia purple lilac lavender plum yellow mustard gold silver orange rust coral nude stone sand oatmeal multi neutral bright pastel metallic leopard zebra snake animal print printed floral striped stripe stripes check checked plaid tartan houndstooth polka dot dots spot gingham paisley camo camouflage colour color block colourblock
wool woollen woolen cashmere merino alpaca mohair cotton linen silk satin velvet velour corduroy cord suede leather faux vegan fur sherpa shearling fleece fleecy knit knitted knitwear chunky cable ribbed rib waffle jersey denim chambray tweed boucle quilted padded puffer down feather nylon polyester lace sequin sequined sparkly glitter sheer mesh chiffon crepe tulle organza viscose modal bamboo terry towelling waterproof water resistant windproof breathable thermal insulated lined heated warm warmest lightweight light heavyweight heavy thick thin soft stretch stretchy
dress dresses gown gowns frock coat coats jacket jackets parka parkas anorak trench overcoat peacoat pea duffle duffel mac raincoat rain blazer blazers suit suits tuxedo waistcoat vest vests gilet gilets cape poncho shacket shirt shirts blouse blouses top tops tee tees tshirt tank cami camisole bodysuit bralette bra corset bustier tunic polo polos henley rugby sweater sweaters jumper jumpers pullover cardigan cardigans hoodie hoodies sweatshirt sweatshirts crewneck crew neck turtleneck roll polo mock funnel zip zipper quarter button buttoned buttons hooded hood collar collared collarless lapel belted belt wrap tie
trousers trouser pants pant jeans jean chinos chino joggers jogger leggings legging shorts short skirt skirts skort culottes palazzo cargo cargos dungarees overalls jumpsuit jumpsuits playsuit romper co ord set sets two piece matching tracksuit sweatsuit loungewear lounge pyjamas pyjama pajamas pajama pjs nightwear nightdress nightie robe dressing gown slippers underwear lingerie socks tights stockings
boots boot booties bootie shoes shoe sneakers sneaker trainers trainer heels heel heeled stiletto pumps flats loafers loafer mules mule sandals sandal slides sliders flip flops espadrilles wedges wedge platform chunky chelsea combat biker cowboy western knee over riding wellies wellington snow hiking walking ankle lace up slip pointed toe square round block kitten
hat hats beanie beanies cap caps beret scarf scarves gloves glove mittens bag bags handbag tote clutch belt belts jewelry jewellery necklace earrings sunglasses
swimsuit swimsuits swimwear swim bikini bikinis tankini cover beach beachwear kaftan sarong resort holiday vacation summer winter spring autumn fall christmas xmas festive halloween easter
wedding guest bridesmaid bride bridal prom formal debs graduation party evening cocktail occasion work office smart casual business going out night date birthday special races racing day everyday sports gym active activewear athletic athleisure yoga running workout school
vintage retro classic modern elegant chic boho bohemian preppy minimalist western military utility aviator bomber biker moto racer varsity letterman harrington field barn quilted hunting fishing outdoor ski snowboard shell technical
new best cheap affordable designer luxury quality sale outlet online shop buy uk ireland irish usa us american british
fashion style styles trend trending outfit outfits clothes clothing wear apparel wardrobe essentials basic basics
v neck scoop off shoulder one strapless halter backless open back slit split pleated pleat ruffle ruffled frill tiered smocked shirred puff bodycon fit flare skater shift slip tea a line empire peplum asymmetric draped twist cowl ruched corset tie dye ombre embroidered beaded embellished crochet cutout cut out
t bathing swimming costume costumes pencil cute sexy graphic strappy bubble fringe fringed packable duster boyfriend girlfriend mom flowy floaty comfortable comfy checkered flannel dressy stylish aran fairisle fluffy elasticated tight cowgirl cigarette bandeau modest mother groom hen tennis army windbreaker wax waxed capri pedal pusher rainwear outerwear knee-high thermal base layer layering
`
export const FASHION_WORDS = new Set(WORDS.split(/\s+/).filter(Boolean))

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "")
const plain = (w: string) => w.replace(/(ies)$/, "y").replace(/(es|s)$/, "")

// True when every word of the keyword is a fashion word (or appears in a live product title)
export function isFashionKeyword(keyword: string, titleWords?: Set<string>): boolean {
  const words = keyword.toLowerCase().replace(/['’]s\b/g, "s").split(/[^a-z0-9]+/).map(norm).filter(Boolean)
  if (!words.length) return false
  return words.every((w) =>
    /^\d+$/.test(w) ||
    FASHION_WORDS.has(w) || FASHION_WORDS.has(plain(w)) ||
    !!titleWords && (titleWords.has(w) || titleWords.has(plain(w))))
}

export function titleWordSet(titles: string[]): Set<string> {
  const s = new Set<string>()
  for (const t of titles) for (const w of t.toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 2 && !/^\d+$/.test(w)) s.add(w)
  return s
}
