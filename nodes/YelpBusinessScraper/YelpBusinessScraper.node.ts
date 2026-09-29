import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import type { OptionField } from './GenericFunctions';
import { applyOptions, requireString, runActorAndGetItems } from './GenericFunctions';

// ScrapeUnblocker's public "Yelp Business Scraper" Actor: https://apify.com/scrapeunblocker/yelp-scraper
const ACTOR_ID = 'dIPL2hyuXtX1q0Kuu';
const INTEGRATION_APP_ID = 'scrapeunblocker-yelp-scraper';

// Node option name -> Actor input key.
const OPTION_FIELDS: Record<string, OptionField> = {
	sort: {
		key: 'sort',
	},
	price: {
		key: 'price',
	},
	openNow: {
		key: 'open_now',
	},
	proxyCountry: {
		key: 'proxy_country',
		kind: 'upper',
	},
};

function buildActorInput(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	options: IDataObject,
	itemIndex: number,
): IDataObject {
	const input: IDataObject = {};

	switch (`${resource}:${operation}`) {
		case 'business:search': {
			input.find_desc = requireString.call(this, 'findDesc', 'Search Term', itemIndex);
			input.find_loc = requireString.call(this, 'findLoc', 'Location', itemIndex);
			input.max_results = this.getNodeParameter('maxResults', itemIndex);
			input.mode = 'search';
			break;
		}
		default:
			throw new NodeOperationError(
				this.getNode(),
				`The operation "${operation}" is not supported for resource "${resource}"`,
				{ itemIndex },
			);
	}

	applyOptions(input, options, OPTION_FIELDS);
	return input;
}

export class YelpBusinessScraper implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Yelp Business Scraper',
		name: 'yelpBusinessScraper',
		icon: {
			light: 'file:yelpBusinessScraper.png',
			dark: 'file:yelpBusinessScraper.dark.png',
		},
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Search Yelp businesses by keyword and location with the ScrapeUnblocker Actor on Apify',
		defaults: {
			name: 'Yelp Business Scraper',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'apifyApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Business',
						value: 'business',
					},
				],
				default: 'business',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['business'],
					},
				},
				options: [
					{
						name: 'Search',
						value: 'search',
						description: 'Search Yelp businesses by keyword and location',
						action: 'Search businesses',
					},
				],
				default: 'search',
			},
			{
				displayName: 'Search Term',
				name: 'findDesc',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'coffee',
				description: 'What to search for, e.g. coffee or plumbers',
				displayOptions: {
					show: {
						resource: ['business'],
						operation: ['search'],
					},
				},
			},
			{
				displayName: 'Location',
				name: 'findLoc',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'San Francisco, CA',
				description:
					'Where to search: a city, neighborhood, address or ZIP code, e.g. San Francisco, CA',
				displayOptions: {
					show: {
						resource: ['business'],
						operation: ['search'],
					},
				},
			},
			{
				displayName: 'Max Results',
				name: 'maxResults',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 30,
				description: 'How many businesses to collect',
				displayOptions: {
					show: {
						resource: ['business'],
						operation: ['search'],
					},
				},
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Open Now',
						name: 'openNow',
						type: 'boolean',
						default: false,
						description: 'Whether to return only businesses that are open at the time of the run',
					},
					{
						displayName: 'Price Levels',
						name: 'price',
						type: 'string',
						default: '',
						placeholder: '1,2',
						description:
							'Only businesses in these price levels, comma-separated: 1 = $, 2 = $$, 3 = $$$, 4 = $$$$ (e.g. 1,2)',
					},
					{
						displayName: 'Proxy Country',
						name: 'proxyCountry',
						type: 'string',
						default: '',
						placeholder: 'US',
						description:
							'Exit-IP country (ISO-2). Leave empty for a US exit, which Yelp needs in most cases.',
					},
					{
						displayName: 'Sort By',
						name: 'sort',
						type: 'options',
						options: [
							{
								name: 'Distance',
								value: 'distance',
							},
							{
								name: 'Highest Rated',
								value: 'rating',
							},
							{
								name: 'Most Reviewed',
								value: 'review_count',
							},
							{
								name: 'Recommended',
								value: 'recommended',
							},
						],
						default: 'recommended',
						description: 'Order of the search results',
					},
					{
						displayName: 'Timeout (Seconds)',
						name: 'timeout',
						type: 'number',
						typeOptions: {
							minValue: 0,
						},
						default: 0,
						description:
							'Maximum run time of the Apify Actor run. 0 keeps the Actor default. A run that times out fails the node.',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const options = this.getNodeParameter('options', i, {}) as IDataObject;
				const { timeout, ...actorOptions } = options;

				const input = buildActorInput.call(this, resource, operation, actorOptions, i);
				const { items: results } = await runActorAndGetItems.call(this, {
					actorId: ACTOR_ID,
					integrationAppId: INTEGRATION_APP_ID,
					input,
					itemIndex: i,
					timeoutSecs: (timeout as number) || undefined,
				});

				for (const result of results) {
					returnData.push({ json: result, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				// Both constructors return an error of their own class unchanged.
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
