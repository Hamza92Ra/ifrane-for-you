export type StaySlug = "dome" | "cabin";
export type Photo = { src: string; width: number; height: number; alt: { en: string; fr: string; ar?: string } };
export type Stay = { slug: StaySlug; hero: Photo; photos: Photo[] };

const arabicAlt: Record<string,string> = {
  "sunset-exterior":"قبة هندسية تحت غروب برتقالي", panorama:"إطلالة بانورامية عبر نافذة القبة ومقاعد أرضية منقوشة", interior:"داخل القبة وفيه سرير ومقاعد منخفضة ونافذة واسعة", "window-bed":"سرير قرب نافذة القبة البانورامية", bed:"سرير بألوان كريمية ومنسوجات منقوشة داخل القبة", "tea-corner":"ركن شاي مع غلاية وأكواب", bathroom:"حمام داخل مكان الإقامة", wardrobe:"ركن تخزين داخل القبة", "night-exterior":"قباب مضاءة بعد حلول الظلام", "living-room":"غرفة جلوس خشبية دافئة مع أريكة منقوشة", lounge:"صالة شاليه بمقاعد منقوشة وجدران خشبية", "sitting-room":"طاولة مستديرة ومقاعد داخل الشاليه الخشبي", "bedroom-warm":"غرفة نوم دافئة بإضاءة هادئة وجدران خشبية", "bedroom-wood":"غرفة نوم بجدران خشبية وأغطية متعددة", "twin-bedroom":"غرفة بسريرين ونقوش مستوحاة من المغرب", landscape:"تلال وخضرة تظهر من مكان الإقامة"
};

const dome = (name: string, width: number, height: number, en: string, fr: string): Photo => ({
  src: `/images/dome/${name}.webp`, width, height, alt: { en, fr, ar: arabicAlt[name] }
});
const cabin = (name: string, width: number, height: number, en: string, fr: string): Photo => ({
  src: `/images/cabin/${name}.webp`, width, height, alt: { en, fr, ar: arabicAlt[name] }
});

export const stays: Record<StaySlug, Stay> = {
  dome: {
    slug: "dome",
    hero: dome("sunset-exterior", 1024, 683, "Geodesic dome beneath an orange sunset", "Dôme géodésique sous un coucher de soleil orange"),
    photos: [
      dome("panorama", 768, 512, "Panoramic view through the dome window with patterned floor cushions", "Vue panoramique depuis le dôme avec coussins à motifs"),
      dome("interior", 768, 512, "Dome interior with bed, low seating and wide window", "Intérieur du dôme avec lit, assises basses et grande fenêtre"),
      dome("window-bed", 768, 512, "Bed beside the dome's panoramic window", "Lit près de la fenêtre panoramique du dôme"),
      dome("bed", 1024, 683, "Cream-toned bed and patterned textiles inside the dome", "Lit aux tons crème et textiles à motifs dans le dôme"),
      dome("tea-corner", 1024, 683, "Tea corner with kettle and cups", "Coin thé avec bouilloire et tasses"),
      dome("bathroom", 1024, 683, "Bathroom with timber door and washbasin", "Salle de bain avec porte en bois et lavabo"),
      dome("wardrobe", 1024, 683, "Storage nook inside the dome", "Espace de rangement dans le dôme"),
      dome("night-exterior", 1024, 683, "Illuminated domes after dark", "Dômes éclairés à la tombée de la nuit")
    ]
  },
  cabin: {
    slug: "cabin",
    hero: cabin("living-room", 683, 854, "Warm timber living room with patterned sofa", "Salon en bois chaleureux avec canapé à motifs"),
    photos: [
      cabin("lounge", 683, 854, "Cabin lounge with patterned seating and timber walls", "Salon du chalet avec assises à motifs et murs en bois"),
      cabin("sitting-room", 683, 854, "Round table and seating in the wooden cabin", "Table ronde et assises dans le chalet en bois"),
      cabin("bedroom-warm", 683, 854, "Warmly lit bedroom with wood walls and patterned rug", "Chambre chaleureuse avec murs en bois et tapis à motifs"),
      cabin("bedroom-wood", 683, 854, "Bedroom with timber walls and layered bedding", "Chambre aux murs en bois et literie douillette"),
      cabin("twin-bedroom", 683, 854, "Bedroom with two beds and Moroccan-inspired patterns", "Chambre avec deux lits et motifs d'inspiration marocaine"),
      cabin("landscape", 747, 933, "Green landscape and hills viewed from the property", "Paysage verdoyant et collines vus depuis la propriété"),
      cabin("bathroom", 683, 854, "Bathroom with double basin and dark tile", "Salle de bain avec double vasque et carrelage sombre")
    ]
  }
};

export function isStaySlug(value: string): value is StaySlug {
  return value === "dome" || value === "cabin";
}
