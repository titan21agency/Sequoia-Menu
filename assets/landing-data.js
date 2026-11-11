/*
 * Sequoia cover page content: the journal and the clubs. Edit this file only; the layout reads it.
 * Text is [Arabic, English]. Leave a list empty to show the "coming soon" state.
 */
(function () {
  'use strict';
  window.SEQUOIA_LANDING = {
    // Sequoia Journal. Page images live in assets/journal/<issue folder>/ (WebP, about 1400 px wide, in reading order).
    // While `pages` is empty the card shows "the first issue is coming soon" and no read button.
    JOURNAL: {
      issue: ['العدد 01', 'Vol. 01'],
      date: ['نوفمبر 2026', 'Nov 2026'],
      title: ['حكايات من على الترابيزة', 'Stories from the table'],
      blurb: ['جرنال مطبوع زي زمان: ناس المكان، حكايات القهوة، وأخبار الشهر.', 'Printed the old way: our people, coffee stories and this month\'s news.'],
      cover: '',            // e.g. 'assets/journal/issue-01/cover.webp' (defaults to the first page)
      pages: []             // e.g. ['assets/journal/issue-01/page-01.webp', 'assets/journal/issue-01/page-02.webp']
    },

    // Sequoia Clubs. Empty = teaser only. Add one object per club, for example:
    // { name: ['نادي الكتاب', 'Book Club'], about: ['كتاب كل شهر ونتكلم فيه على قهوة.', 'One book a month, talked over coffee.'],
    //   when: ['الخميس · 8 م', 'Thu · 8 PM'], image: 'assets/clubs/book-club.webp' }
    CLUBS: []
  };
})();
