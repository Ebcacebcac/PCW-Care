/* PC Workshop's contact details — copied from the Customer Hub
   (CUSTOMER HUB/app/(app)/_components/support/workshops.ts in pcw-hub-2.1).
   Keep them in step with that file. */

export const PHONE_DISPLAY = '0191 285 9999';
export const PHONE_TEL = '01912859999';
export const EMAIL = 'support@pcworkshop.co.uk';
export const WEBSITE = 'https://www.pcworkshop.co.uk';
export const HUB_URL = 'https://customer.pcwhub.co.uk';
export const BOOK_IN_URL = 'https://customer.pcwhub.co.uk/book-in';
export const SUPPORT_PAGE_URL = 'https://customer.pcwhub.co.uk/support';
export const RELEASES_URL = 'https://github.com/Ebcacebcac/PCW-Care/releases/latest';

export interface Workshop {
  name: string;
  addressLines: string[];
  hours: { days: string; time: string }[];
}

export const WORKSHOPS: Workshop[] = [
  {
    name: 'Gosforth',
    addressLines: ['1 Salters Road, Gosforth', 'Newcastle upon Tyne', 'NE3 1DH'],
    hours: [
      { days: 'Monday – Friday', time: '9:00 – 17:30' },
      { days: 'Saturday', time: '9:00 – 15:00' },
      { days: 'Sunday', time: 'By appointment only' },
    ],
  },
  {
    name: 'Benton',
    addressLines: ['369 Benton Road, Four Lane Ends', 'Newcastle upon Tyne', 'NE7 7EE'],
    hours: [
      { days: 'Monday – Friday', time: '9:00 – 17:00' },
      { days: 'Saturday', time: '9:00 – 15:00' },
      { days: 'Sunday', time: 'By appointment only' },
    ],
  },
];

export const HOURS_NOTE = 'Closed Bank Holiday weekends.';
