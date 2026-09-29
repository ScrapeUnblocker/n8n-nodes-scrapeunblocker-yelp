import { YelpBusinessScraper } from './nodes/YelpBusinessScraper/YelpBusinessScraper.node';
import { ApifyApi } from './credentials/ApifyApi.credentials';

export const nodeTypes = [YelpBusinessScraper];

export const credentialTypes = [ApifyApi];
