// Shared app types

export type ColorOption = 'white' | 'black' | 'gray';

export interface Device {
  id: string;
  apiKey: string;
  serialNumber: string;
  nickname: string;
}

export interface Settings {
  devices: Device[];
  selectedDeviceId: string;
}

export interface PreviewConfig {
  title: string;
  message: string;
  signature: string;
  icon: string;
  link: string;
}

export interface ImageConfig {
  link: string;
}

export interface TextItemConfig {
  id: string;
  content: string;
  x: number;
  y: number;
  fontSize: number;
  rotation: number;
  fontWeight: 'normal' | 'bold';
  textAlign: 'left' | 'center' | 'right';
  color: ColorOption;
  fontFamily: string;
}

export interface TextToImageConfig {
  backgroundColor: ColorOption;
  backgroundImage: string | null;
  texts: TextItemConfig[];
  link: string;
}

// Gallery and icon items
export interface ExampleImageItem {
  id: string;
  name: string;
  size: string;
  preview: string;
}

export interface ExampleIcon {
  id: string;
  name: string;
  path: string;
}
