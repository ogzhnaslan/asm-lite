export const ASSET_TYPES = ['DOMAIN', 'IP'] as const;

export type AssetType = typeof ASSET_TYPES[number];

export const ASSET_STATUS = ['PENDING', 'VERIFIED'] as const;

export type AssetStatus = typeof ASSET_STATUS[number];
