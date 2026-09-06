/* The General Roman Calendar — the celebrations fixed to a calendar date.

   romcal was the obvious library for this, but neither published version is
   usable: v1 is 4.6 MB and depends on the deprecated moment, and v3.0.0's
   build does not export its Romcal engine class at all (index.d.ts declares
   it, the shipped JavaScript does not contain it). This table is a few
   kilobytes instead, and it is the data the app actually needs.

   `common` names the section of the book to fall back on for a celebration's
   own texts, since the book prints the commons but no sanctoral propers. */

export type Rank = 'solemnity' | 'feast' | 'memorial' | 'optional' | 'ferial';
export type Colour = 'white' | 'red' | 'green' | 'violet' | 'rose' | 'black';

/** The commons the book prints, for Evening Prayer on a saint's day. */
export type Common =
  | 'dedication' | 'mary' | 'apostles' | 'martyrs' | 'holy-men' | 'holy-women' | null;

export interface Celebration {
  /** 1-12 */
  month: number;
  day: number;
  name: string;
  rank: Rank;
  colour: Colour;
  common?: Common;
  /** Titles the book's own feast tables name, so the office can be routed. */
  properKey?: string;
  /** Feasts of the Lord displace a Sunday in Ordinary Time. */
  ofTheLord?: boolean;
  /** The very highest tier: Easter, Christmas, Ash Wednesday and the like. */
  principal?: boolean;
}

/* Ranks below are the General Roman Calendar's. A celebration marked
   'optional' may be kept or passed over; the app shows it and says so. */
export const SANCTORAL: Celebration[] = [
  // ------------------------------------------------------------- January
  { month: 1, day: 1, name: 'Mary, the Holy Mother of God', rank: 'solemnity', colour: 'white', common: 'mary', properKey: 'MARY MOTHER OF GOD JAN 1' },
  { month: 1, day: 2, name: 'Ss Basil the Great and Gregory Nazianzen, Bishops and Doctors', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 1, day: 3, name: 'The Most Holy Name of Jesus', rank: 'optional', colour: 'white' },
  { month: 1, day: 7, name: 'St Raymond of Penyafort, Priest', rank: 'optional', colour: 'white', common: 'holy-men' },
  { month: 1, day: 13, name: 'St Hilary, Bishop and Doctor', rank: 'optional', colour: 'white', common: 'holy-men' },
  { month: 1, day: 17, name: 'St Anthony, Abbot', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 1, day: 20, name: 'St Fabian, Pope and Martyr', rank: 'optional', colour: 'red', common: 'martyrs' },
  { month: 1, day: 21, name: 'St Agnes, Virgin and Martyr', rank: 'memorial', colour: 'red', common: 'martyrs' },
  { month: 1, day: 22, name: 'St Vincent, Deacon and Martyr', rank: 'optional', colour: 'red', common: 'martyrs' },
  { month: 1, day: 24, name: 'St Francis de Sales, Bishop and Doctor', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 1, day: 25, name: 'The Conversion of St Paul, Apostle', rank: 'feast', colour: 'white', common: 'apostles' },
  { month: 1, day: 26, name: 'Ss Timothy and Titus, Bishops', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 1, day: 28, name: 'St Thomas Aquinas, Priest and Doctor', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 1, day: 31, name: 'St John Bosco, Priest', rank: 'memorial', colour: 'white', common: 'holy-men' },

  // ------------------------------------------------------------ February
  { month: 2, day: 2, name: 'The Presentation of the Lord', ofTheLord: true, rank: 'feast', colour: 'white', properKey: 'PRESENTATION FEB. 2' },
  { month: 2, day: 3, name: 'St Blaise, Bishop and Martyr', rank: 'optional', colour: 'red', common: 'martyrs' },
  { month: 2, day: 5, name: 'St Agatha, Virgin and Martyr', rank: 'memorial', colour: 'red', common: 'martyrs' },
  { month: 2, day: 6, name: 'St Paul Miki and Companions, Martyrs', rank: 'memorial', colour: 'red', common: 'martyrs' },
  { month: 2, day: 10, name: 'St Scholastica, Virgin', rank: 'memorial', colour: 'white', common: 'holy-women' },
  { month: 2, day: 11, name: 'Our Lady of Lourdes', rank: 'optional', colour: 'white', common: 'mary' },
  { month: 2, day: 14, name: 'Ss Cyril, Monk, and Methodius, Bishop', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 2, day: 22, name: 'The Chair of St Peter, Apostle', rank: 'feast', colour: 'white', common: 'apostles' },
  { month: 2, day: 23, name: 'St Polycarp, Bishop and Martyr', rank: 'memorial', colour: 'red', common: 'martyrs' },

  // --------------------------------------------------------------- March
  { month: 3, day: 7, name: 'Ss Perpetua and Felicity, Martyrs', rank: 'memorial', colour: 'red', common: 'martyrs' },
  { month: 3, day: 19, name: 'St Joseph, Spouse of the Blessed Virgin Mary', rank: 'solemnity', colour: 'white', common: 'holy-men' },
  { month: 3, day: 25, name: 'The Annunciation of the Lord', rank: 'solemnity', colour: 'white', properKey: 'ANNUNCIATION MARCH 25' },

  // --------------------------------------------------------------- April
  { month: 4, day: 25, name: 'St Mark, Evangelist', rank: 'feast', colour: 'red', common: 'apostles' },
  { month: 4, day: 29, name: 'St Catherine of Siena, Virgin and Doctor', rank: 'memorial', colour: 'white', common: 'holy-women' },

  // ----------------------------------------------------------------- May
  { month: 5, day: 1, name: 'St Joseph the Worker', rank: 'optional', colour: 'white', common: 'holy-men' },
  { month: 5, day: 3, name: 'Ss Philip and James, Apostles', rank: 'feast', colour: 'red', common: 'apostles' },
  { month: 5, day: 14, name: 'St Matthias, Apostle', rank: 'feast', colour: 'red', common: 'apostles' },
  { month: 5, day: 26, name: 'St Philip Neri, Priest', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 5, day: 31, name: 'The Visitation of the Blessed Virgin Mary', rank: 'feast', colour: 'white', common: 'mary' },

  // ---------------------------------------------------------------- June
  { month: 6, day: 11, name: 'St Barnabas, Apostle', rank: 'memorial', colour: 'red', common: 'apostles' },
  { month: 6, day: 13, name: 'St Anthony of Padua, Priest and Doctor', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 6, day: 21, name: 'St Aloysius Gonzaga, Religious', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 6, day: 24, name: 'The Nativity of St John the Baptist', rank: 'solemnity', colour: 'white', common: 'holy-men' },
  { month: 6, day: 28, name: 'St Irenaeus, Bishop and Martyr', rank: 'memorial', colour: 'red', common: 'martyrs' },
  { month: 6, day: 29, name: 'Ss Peter and Paul, Apostles', rank: 'solemnity', colour: 'red', common: 'apostles' },

  // ---------------------------------------------------------------- July
  { month: 7, day: 3, name: 'St Thomas, Apostle', rank: 'feast', colour: 'red', common: 'apostles' },
  { month: 7, day: 11, name: 'St Benedict, Abbot', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 7, day: 22, name: 'St Mary Magdalene', rank: 'feast', colour: 'white', common: 'holy-women' },
  { month: 7, day: 25, name: 'St James, Apostle', rank: 'feast', colour: 'red', common: 'apostles' },
  { month: 7, day: 26, name: 'Ss Joachim and Anne, Parents of the Blessed Virgin Mary', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 7, day: 29, name: 'Ss Martha, Mary and Lazarus', rank: 'memorial', colour: 'white', common: 'holy-women' },
  { month: 7, day: 31, name: 'St Ignatius of Loyola, Priest', rank: 'memorial', colour: 'white', common: 'holy-men' },

  // -------------------------------------------------------------- August
  { month: 8, day: 1, name: 'St Alphonsus Liguori, Bishop and Doctor', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 8, day: 4, name: 'St John Vianney, Priest', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 8, day: 6, name: 'The Transfiguration of the Lord', ofTheLord: true, rank: 'feast', colour: 'white', properKey: 'TRANSFIGURATION AUG. 6' },
  { month: 8, day: 8, name: 'St Dominic, Priest', rank: 'solemnity', colour: 'white', common: 'holy-men' },
  { month: 8, day: 10, name: 'St Lawrence, Deacon and Martyr', rank: 'feast', colour: 'red', common: 'martyrs' },
  { month: 8, day: 11, name: 'St Clare, Virgin', rank: 'memorial', colour: 'white', common: 'holy-women' },
  { month: 8, day: 14, name: 'St Maximilian Kolbe, Priest and Martyr', rank: 'memorial', colour: 'red', common: 'martyrs' },
  { month: 8, day: 15, name: 'The Assumption of the Blessed Virgin Mary', rank: 'solemnity', colour: 'white', common: 'mary' },
  { month: 8, day: 20, name: 'St Bernard, Abbot and Doctor', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 8, day: 22, name: 'The Queenship of the Blessed Virgin Mary', rank: 'memorial', colour: 'white', common: 'mary' },
  { month: 8, day: 24, name: 'St Bartholomew, Apostle', rank: 'feast', colour: 'red', common: 'apostles' },
  { month: 8, day: 27, name: 'St Monica', rank: 'memorial', colour: 'white', common: 'holy-women' },
  { month: 8, day: 28, name: 'St Augustine, Bishop and Doctor', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 8, day: 29, name: 'The Passion of St John the Baptist', rank: 'memorial', colour: 'red', common: 'martyrs' },

  // ----------------------------------------------------------- September
  { month: 9, day: 3, name: 'St Gregory the Great, Pope and Doctor', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 9, day: 8, name: 'The Nativity of the Blessed Virgin Mary', rank: 'feast', colour: 'white', common: 'mary' },
  { month: 9, day: 13, name: 'St John Chrysostom, Bishop and Doctor', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 9, day: 14, name: 'The Exaltation of the Holy Cross', ofTheLord: true, rank: 'feast', colour: 'red', properKey: 'EXALTATION OF HOLY CROSS' },
  { month: 9, day: 15, name: 'Our Lady of Sorrows', rank: 'memorial', colour: 'white', common: 'mary' },
  { month: 9, day: 16, name: 'Ss Cornelius, Pope, and Cyprian, Bishop, Martyrs', rank: 'memorial', colour: 'red', common: 'martyrs' },
  { month: 9, day: 21, name: 'St Matthew, Apostle and Evangelist', rank: 'feast', colour: 'red', common: 'apostles' },
  { month: 9, day: 29, name: 'Ss Michael, Gabriel and Raphael, Archangels', rank: 'feast', colour: 'white', properKey: 'MICHAEL, GABRIEL &RAPHAEL' },
  { month: 9, day: 30, name: 'St Jerome, Priest and Doctor', rank: 'memorial', colour: 'white', common: 'holy-men' },

  // ------------------------------------------------------------- October
  { month: 10, day: 1, name: 'St Thérèse of the Child Jesus, Virgin and Doctor', rank: 'memorial', colour: 'white', common: 'holy-women' },
  { month: 10, day: 2, name: 'The Holy Guardian Angels', rank: 'memorial', colour: 'white', properKey: 'GUARDIAN ANGELS' },
  { month: 10, day: 4, name: 'St Francis of Assisi', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 10, day: 7, name: 'Our Lady of the Rosary', rank: 'memorial', colour: 'white', common: 'mary' },
  { month: 10, day: 15, name: 'St Teresa of Jesus, Virgin and Doctor', rank: 'memorial', colour: 'white', common: 'holy-women' },
  { month: 10, day: 17, name: 'St Ignatius of Antioch, Bishop and Martyr', rank: 'memorial', colour: 'red', common: 'martyrs' },
  { month: 10, day: 18, name: 'St Luke, Evangelist', rank: 'feast', colour: 'red', common: 'apostles' },
  { month: 10, day: 28, name: 'Ss Simon and Jude, Apostles', rank: 'feast', colour: 'red', common: 'apostles' },

  // ------------------------------------------------------------ November
  { month: 11, day: 1, name: 'All Saints', rank: 'solemnity', colour: 'white', properKey: 'ALL SAINTS NOV. 1' },
  { month: 11, day: 2, name: 'The Commemoration of All the Faithful Departed', rank: 'solemnity', colour: 'violet', properKey: 'ALL SOULS NOV. 2' },
  { month: 11, day: 9, name: 'The Dedication of the Lateran Basilica', rank: 'feast', colour: 'white', common: 'dedication' },
  { month: 11, day: 10, name: 'St Leo the Great, Pope and Doctor', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 11, day: 11, name: 'St Martin of Tours, Bishop', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 11, day: 21, name: 'The Presentation of the Blessed Virgin Mary', rank: 'memorial', colour: 'white', common: 'mary' },
  { month: 11, day: 22, name: 'St Cecilia, Virgin and Martyr', rank: 'memorial', colour: 'red', common: 'martyrs' },
  { month: 11, day: 30, name: 'St Andrew, Apostle', rank: 'feast', colour: 'red', common: 'apostles' },

  // ------------------------------------------------------------ December
  { month: 12, day: 3, name: 'St Francis Xavier, Priest', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 12, day: 7, name: 'St Ambrose, Bishop and Doctor', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 12, day: 8, name: 'The Immaculate Conception of the Blessed Virgin Mary', rank: 'solemnity', colour: 'white', common: 'mary' },
  { month: 12, day: 13, name: 'St Lucy, Virgin and Martyr', rank: 'memorial', colour: 'red', common: 'martyrs' },
  { month: 12, day: 14, name: 'St John of the Cross, Priest and Doctor', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 12, day: 25, name: 'The Nativity of the Lord', principal: true, rank: 'solemnity', colour: 'white', properKey: 'CHRISTMAS' },
  { month: 12, day: 26, name: 'St Stephen, the First Martyr', rank: 'feast', colour: 'red', common: 'martyrs' },
  { month: 12, day: 27, name: 'St John, Apostle and Evangelist', rank: 'feast', colour: 'white', common: 'apostles', properKey: 'ST JOHN DEC. 27' },
  { month: 12, day: 28, name: 'The Holy Innocents, Martyrs', rank: 'feast', colour: 'red', common: 'martyrs', properKey: 'HOLY INNOCENT DEC. 28' },
  { month: 12, day: 29, name: 'St Thomas Becket, Bishop and Martyr', rank: 'optional', colour: 'red', common: 'martyrs', properKey: 'DEC. 29' },
  { month: 12, day: 31, name: 'St Sylvester I, Pope', rank: 'optional', colour: 'white', common: 'holy-men', properKey: 'DEC. 31' },
];

/* Dominican additions — this is the Order's own book, and these are the days
   a Dominican house keeps that the General Calendar does not. */
export const DOMINICAN: Celebration[] = [
  { month: 1, day: 7, name: 'St Raymond of Penyafort, Priest', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 2, day: 4, name: 'Bl Fra Angelico, Religious', rank: 'optional', colour: 'white', common: 'holy-men' },
  { month: 2, day: 12, name: 'Bl Reginald of Orleans, Priest', rank: 'optional', colour: 'white', common: 'holy-men' },
  { month: 3, day: 7, name: 'St Thomas Aquinas — Dominican transfer', rank: 'optional', colour: 'white', common: 'holy-men' },
  { month: 4, day: 29, name: 'St Catherine of Siena, Virgin and Doctor, Patron of the Order', rank: 'feast', colour: 'white', common: 'holy-women' },
  { month: 5, day: 24, name: 'The Translation of Our Holy Father Dominic', rank: 'memorial', colour: 'white', common: 'holy-men' },
  { month: 8, day: 8, name: 'Our Holy Father Dominic, Priest and Founder of the Order', rank: 'solemnity', colour: 'white', common: 'holy-men' },
  { month: 9, day: 18, name: 'Bl John Macias, Religious', rank: 'optional', colour: 'white', common: 'holy-men' },
  { month: 11, day: 7, name: 'All Saints of the Order of Preachers', rank: 'feast', colour: 'white', common: 'holy-men' },
  { month: 11, day: 8, name: 'All Souls of the Order of Preachers', rank: 'memorial', colour: 'violet', common: null },
  { month: 11, day: 15, name: 'St Albert the Great, Bishop and Doctor', rank: 'memorial', colour: 'white', common: 'holy-men' },
];

export const RANK_NAMES: Record<Rank, string> = {
  solemnity: 'Solemnity',
  feast: 'Feast',
  memorial: 'Memorial',
  optional: 'Optional Memorial',
  ferial: 'Weekday',
};

export const COLOUR_NAMES: Record<Colour, string> = {
  white: 'White', red: 'Red', green: 'Green',
  violet: 'Violet', rose: 'Rose', black: 'Black',
};

export const COMMON_NAMES: Record<Exclude<Common, null>, string> = {
  dedication: 'Dedication of a Church',
  mary: 'the Blessed Virgin Mary',
  apostles: 'Apostles',
  martyrs: 'Martyrs',
  'holy-men': 'Holy Men',
  'holy-women': 'Holy Women',
};
