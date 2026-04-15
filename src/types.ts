export interface Event {
  id: string;
  title: string;
  organization: string;
  type: 'hackathon' | 'scheme' | 'program';
  description: string;
  location: string;
  date: string;
  link: string;
  price?: string; // e.g., "Free", "Paid", "₹500"
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface UserProfile {
  location: string;
  age: number | '';
  interests: string[];
  notificationsEnabled: boolean;
  bookmarkedEventIds?: string[];
}

export interface UserLocation {
  lat: number;
  lng: number;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  type: 'new_event' | 'deadline' | 'system';
  link?: string;
}
