export interface ProductImageOption {
  key: string;
  label: string;
  src: string;
}

export const PRODUCT_IMAGE_OPTIONS: ProductImageOption[] = [
  {
    key: 'wireless-mouse',
    label: 'Wireless Mouse',
    src: '/src/assets/images/product_wireless_mouse_1795007228156.jpg',
  },
  {
    key: 'usbc-cable',
    label: 'USB-C Cable',
    src: '/src/assets/images/product_usbc_cable_1795007229381.jpg',
  },
  {
    key: 'thermal-rolls',
    label: 'Thermal Paper Rolls',
    src: '/src/assets/images/product_thermal_rolls_1795007230070.jpg',
  },
  {
    key: 'studio-headphones',
    label: 'Studio Headphones',
    src: '/src/assets/images/product_studio_headphones_1795007229487.jpg',
  },
];

export function getProductImageSrc(imageKey?: string): string | null {
  if (!imageKey) return null;
  const found = PRODUCT_IMAGE_OPTIONS.find((item) => item.key === imageKey);
  return found ? found.src : null;
}
