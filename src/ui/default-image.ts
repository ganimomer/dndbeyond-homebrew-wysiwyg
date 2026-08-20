/**
 * Default stat-block art by creature type, used when a monster has no uploaded
 * avatar. These are D&D Beyond's own per-type images (served from its host, so
 * the page CSP already allows them); this is a *preview-only* fallback and is
 * never written back to the form.
 *
 * URLs verified against dndbeyond.com (each returns 200 image/jpeg). The
 * attachment ids happen to run sequentially in alphabetical order, but they are
 * listed explicitly rather than computed — a literal table is what actually got
 * checked, and a stale one fails loudly against these constants.
 */

const TYPE_IMAGES: Record<string, string> = {
  aberration: "https://www.dndbeyond.com/attachments/2/647/aberration.jpg",
  beast: "https://www.dndbeyond.com/attachments/2/648/beast.jpg",
  celestial: "https://www.dndbeyond.com/attachments/2/649/celestial.jpg",
  construct: "https://www.dndbeyond.com/attachments/2/650/construct.jpg",
  dragon: "https://www.dndbeyond.com/attachments/2/651/dragon.jpg",
  elemental: "https://www.dndbeyond.com/attachments/2/652/elemental.jpg",
  fey: "https://www.dndbeyond.com/attachments/2/653/fey.jpg",
  fiend: "https://www.dndbeyond.com/attachments/2/654/fiend.jpg",
  giant: "https://www.dndbeyond.com/attachments/2/655/giant.jpg",
  humanoid: "https://www.dndbeyond.com/attachments/2/656/humanoid.jpg",
  monstrosity: "https://www.dndbeyond.com/attachments/2/657/monstrosity.jpg",
  ooze: "https://www.dndbeyond.com/attachments/2/658/ooze.jpg",
  plant: "https://www.dndbeyond.com/attachments/2/659/plant.jpg",
  undead: "https://www.dndbeyond.com/attachments/2/660/undead.jpg",
};

/**
 * D&D Beyond's default image for a creature's base type, or `undefined` for an
 * empty/unknown type (in which case the stat block simply shows no art, as
 * before). Case-insensitive — DDB's 5.5e types are capitalized ("Undead").
 */
export function defaultImageUrl(type: string | undefined): string | undefined {
  const key = (type ?? "").trim().toLowerCase();
  return TYPE_IMAGES[key];
}
