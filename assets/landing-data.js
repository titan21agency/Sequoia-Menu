/*
 * Sequoia cover page content: the journal and the events. Edit this file only; the layout reads it.
 * Text is [Arabic, English]. Leave a list empty to show the "coming soon" state.
 */
(function () {
  'use strict';
  window.SEQUOIA_LANDING = {
    // Sequoia Journal. Page images live in assets/journal/<issue folder>/ (WebP, about 1400 px wide, in reading order).
    // While `pages` is empty the card shows "the first issue is coming soon" and no read button.
    JOURNAL: {
      issue: ['العدد الأول', 'Vol. 01'],
      date: ['ديسمبر 2026', 'Dec 2026'],
      title: ['جرنال الزمن الجميل', 'The good old days, by the Nile'],
      blurb: ['٨ صفحات: ساعة النيل، أخبار التسعينات، حكاية المنصورة، طيور الشط، ٣٠ حاجة تعملها هنا، وفعاليات الموسم.',
              'Eight pages: the Nile hour, 90s news, the story of Mansoura, river birds, 30 things to do here and this season\'s events.'],
      cover: 'assets/journal/issue-01/cover-thumb.webp',   // small copy of page 1 for the card (shown 124 px wide)
      pages: [
        'assets/journal/issue-01/page-01.webp', 'assets/journal/issue-01/page-02.webp',
        'assets/journal/issue-01/page-03.webp', 'assets/journal/issue-01/page-04.webp',
        'assets/journal/issue-01/page-05.webp', 'assets/journal/issue-01/page-06.webp',
        'assets/journal/issue-01/page-07.webp', 'assets/journal/issue-01/page-08.webp'
      ]
    },

    // Sequoia Events (the section is still keyed CLUBS). One object per event; image is optional.
    CLUBS: [
      { name: ['ليلة الشهب', 'Meteor night'], about: ['ذروة شهب التوأميات، أغزر زخّة في السنة.', 'The Geminids peak, the strongest shower of the year.'], when: ['١٣ – ١٤ ديسمبر', 'Dec 13 – 14'] },
      { name: ['آخر بدر في ٢٠٢٦', 'Last full moon of 2026'], about: ['الشمس بتغرب قدامك والبدر بيطلع من وراك.', 'The sun sets in front of you as the moon rises behind you.'], when: ['٢٤ ديسمبر', 'Dec 24'] },
      { name: ['آخر غروب في السنة', 'Last sunset of the year'], about: ['حوالي ٥ المغرب على شط النيل.', 'Around 5 PM on the riverbank.'], when: ['٣١ ديسمبر', 'Dec 31'] },
      { name: ['البدر العملاق', 'Supermoon'], about: ['القمر في أقرب نقطة ليه من الأرض.', 'The Moon at its closest to Earth.'], when: ['٢٢ يناير', 'Jan 22'] },
      { name: ['عيد الحب على النيل', 'Valentine\'s by the Nile'], about: ['الغروب حوالي ٥:٣٨.', 'Sunset around 5:38 PM.'], when: ['١٤ فبراير', 'Feb 14'] }
    ]
  };
})();
