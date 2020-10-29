/**
 *
 *  mwn: a MediaWiki bot framework for Node.js
 *
 * 	Copyright (C) 2020 Siddharth VP
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 */

/**
 * Attributions:
 * Parts of the code are adapted from MWBot <https://github.com/Fannon/mwbot/src/index.js>
 * released under the MIT license. Copyright (c) 2015-2018 Simon Heimler.
 *
 * Some parts are copied from the mediawiki.api module in mediawiki core
 * <https://gerrit.wikimedia.org/r/plugins/gitiles/mediawiki/core/+/master/resources/src/mediawiki.api>
 * released under GNU GPL v2.
 *
 */

import axios, {AxiosRequestConfig} from 'axios';

import tough = require('tough-cookie');
import axiosCookieJarSupport = require('axios-cookiejar-support');
axiosCookieJarSupport.default(axios);
import formData = require('form-data');
import OAuth = require('oauth-1.0a');
import http = require('http');
import https = require('https');

import fs = require('fs');
import path = require('path');
import crypto = require('crypto');

const semlog = require('semlog');
const log: ((data: any) => void) = semlog.log;

const MwnDate = require('./date');
const MwnTitle = require('./title');
const MwnPage = require('./page');
const MwnWikitext = require('./wikitext');
const MwnUser = require('./user');
const MwnCategory = require('./category');
const MwnFile = require('./file');
const MwnStream = require('./eventstream');
const static_utils = require('./static_utils');

import {MwnError, MwnErrorConfig} from "./error";

import type {Link, CategoryLink, FileLink, PageLink, Template, TemplateConfig, Section} from "./wikitext";
import type {
	ApiDeleteParams,
	ApiEditPageParams, ApiMoveParams,
	ApiParseParams, ApiPurgeParams,
	ApiQueryAllPagesParams, ApiQueryCategoryMembersParams, ApiQuerySearchParams, ApiRollbackParams,
	ApiUndeleteParams, ApiUploadParams
} from "./api_params";

type revisionprop = "content" | "timestamp" | "user" | "comment" | "parsedcomment" | "ids" | "flags" |
	"size"  | "tags" | "userid" | "contentmodel"
type logprop =  "type" | "user" | "comment" | "details" | "timestamp" | "title" | "parsedcomment" | "ids" |
	"tags" | "userid"

interface RawRequestParams extends AxiosRequestConfig {
	retryNumber?: number
}

// The interfaces corresponding to the nested classes appear below.
// The declarations need to be duplicated here because TypeScript doesn't really support
// nested classes.
export interface Title {
	title: string
	namespace: number
	fragment: string
	getNamespaceId(): number
	getMain(): string
	getMainText(): string
	getPrefixedDb(): string
	getPrefixedText(): string
	getFragment(): string | null
	isTalkPage(): boolean
	getTalkPage(): Title | null
	getSubjectPage(): Title | null
	canHaveTalkPage(): boolean
	getExtension(): string | null
	getDotExtension(): string
	toString(): string
	toText(): string
}
export interface Page extends Title {
	data: any
	getTalkPage(): Page
	getSubjectPage(): Page
	text(): Promise<string>
	categories(): Promise<{ sortkey: string, category: string, hidden: boolean }>
	templates(): Promise<{ ns: number, title: string, exists: boolean }>
	links(): Promise<{ ns: number, title: string, exists: boolean }>
	backlinks(): Promise<string[]>
	transclusions(): Promise<string[]>
	images(): Promise<string[]>
	externallinks(): Promise<string[]>
	subpages(options?: ApiQueryAllPagesParams): Promise<string[]>
	isRedirect(): Promise<boolean>
	getRedirectTarget(): Promise<string>
	isRedirect(): Promise<boolean>
	getRedirectTarget(): Promise<string>
	getCreator(): Promise<string>
	getDeletingAdmin(): Promise<string>
	getDescription(customOptions?: any): Promise<string>
	history(props: revisionprop[] | revisionprop, limit: number, customOptions?: any): Promise<object[]>
	logs(props: logprop | logprop[], limit?: number, type?: string, customOptions?: any): Promise<object[]>
	edit(transform: ((rev: {content: string, timestamp: string}) => string | object)): Promise<any>
	save(text: string, summary?: string, options?: any): Promise<any>
	newSection(header: string, message: string, additionalParams?: any): Promise<any>
	move(target: string, summary: string, options?: any): Promise<any>
	delete(summary: string, options?: any): Promise<any>
	undelete(summary: string, options?: any): Promise<any>
	purge(options?: any): Promise<any>
}
export interface File extends Page {
	getName(): string
	getNameText (): string
	usages(options: ApiParams): Promise<{pageid: number, title: string, redirect: boolean}>
	download(localname: string): void
}
export interface Category extends Page {
	members(options: ApiParams): Promise<{pageid: number, ns: number, title: string}>
	pages(options: ApiParams): Promise<{pageid: number, ns: number, title: string}>
	subcats(options: ApiParams): Promise<{pageid: number, ns: number, title: string}>
	files(options: ApiParams): Promise<{pageid: number, ns: number, title: string}>
}
export interface Stream {
	addListener(action: ((data: any) => any), filter: any): void
}
export interface User extends Title {
	username: string
	userpage: Page
	talkpage: Page
	// get userpage(): Page // XXX
	// get talkpage(): Page
	contribs(options: ApiParams): Promise<any[]>
	logs(options: ApiParams): Promise<any[]>
	info(props: ApiParams): Promise<any>
	globalinfo(props: string | string[]): Promise<any>
	sendMessage(header: string, message: string): Promise<any>
	email(subject: string, message: string): Promise<any>
	block(options: ApiParams): Promise<any>
	unblock(options: ApiParams): Promise<any>
}
export interface Wikitext {
	text: string
	links: Array<PageLink>
	templates: Array<Template>
	files: Array<FileLink>
	categories: Array<CategoryLink>
	sections: Array<Section>

	parseLinks(): void
	parseTemplates(config: TemplateConfig): Template[]
	removeEntity(entity: Link | Template): void
	parseSections(): Section[]
	unbind(prefix: string, postfix: string): void
	rebind(): string
	getText(): string
	apiParse(options: ApiParseParams): Promise<string>
}
export interface XDate extends Date {
	isValid(): boolean
	isBefore(date: Date | XDate): boolean
	isAfter(date: Date | XDate): boolean
	getUTCMonthName(): string
	getUTCMonthNameAbbrev(): string
	getMonthName(): string
	getMonthNameAbbrev(): string
	getUTCDayName(): string
	getUTCDayNameAbbrev(): string
	getDayName(): string
	getDayNameAbbrev(): string
	add(number: number, unit: 'seconds' | 'minutes' | 'hours' | 'days'| 'months' | 'years'): XDate
	subtract(number: number, unit: 'seconds' | 'minutes' | 'hours' | 'days'| 'months' | 'years'): XDate
	format(formatstr: string, zone?: number | 'utc' | 'system'): string
	calendar(zone?: number | 'utc' | 'system'): string
}

export interface MwnOptions {
	silent?: boolean
	apiUrl?: string
	userAgent?: string
	username?: string
	password?: string
	OAuthCredentials?: {
		consumerToken: string,
		consumerSecret: string,
		accessToken: string,
		accessSecret: string
	}
	maxRetries?: number
	retryPause?: number
	shutoff?: {
		intervalDuration?: number
		page?: string
		condition?: RegExp | ((text: string) => boolean)
		onShutoff?: ((text: string) => void)
	}
	defaultParams?: ApiParams
	suppressAPIWarnings?: boolean
	editConfig?: editConfigType
	suppressInvalidDateWarning?: boolean;
	semlog?: object
}

type editConfigType = {
	conflictRetries?: number
	suppressNochangeWarning?: boolean
	exclusionRegex?: RegExp
}

type ApiParams = {
	[param: string]: string | string[] | boolean | number | number[] | {
		stream: ReadableStream
		name: string
	}
}

type ApiResponse = any

export interface ApiPage {
	title: string
	missing?: boolean
	invalid?: boolean
	revisions: ApiRevision[]
}

export interface ApiRevision {
   content: string
   timestamp: string
   slots?: {
	   main: {
		   content: string
		   timestamp: string
	   }
   }
}

type ApiEditResponse = { // fix
	title: string
	nochange?: boolean
	oldrevid: number
	newrevid: number
}



export class mwn {

	/**
	 * Bot instance Login State
	 * Is received from the MW Login API and contains token, userid, etc.
	 */
	state: any

	/**
	 * Bot instance is logged in or not
	 */
	loggedIn: boolean

	/**
	 * Bot instance's edit token.
	 */
	csrfToken: string

	/**
	 * Default options.
	 * Should be immutable
	 */
	readonly defaultOptions: MwnOptions

	options: MwnOptions

	cookieJar: tough.CookieJar

	static requestDefaults: RawRequestParams

	requestOptions: RawRequestParams

	shutoff: {
		state: boolean
		hook: ReturnType<typeof setInterval>
	}

	hasApiHighLimit: boolean

	oauth: OAuth

	usingOAuth: boolean

	title: {
		new (title: string, namespace?: number): Title
		idNameMap: {
			[namespaceId: number]: string
		}
		nameIdMap: {
			[namespaceName: string]: number
		}
		legaltitlechars: string
		caseSensitiveNamespaces: Array<number>

		processNamespaceData(json: {
			query: {
				general: { legaltitlechars: string }
				namespaces: { name: string, id: number, canonical: boolean, case: string }[]
				namespacealiases: { alias: string, id: number }[]
			}
		}): void
		checkData(): void
		newFromText(title: string, namespace?: number): Title | null
		makeTitle(namespace: number, title: string): Title | null
		isTalkNamespace(namespaceId: number): boolean
		phpCharToUpper(chr: string): string
	}
	page: {
		new (title: string, namespace?: number): Page
	}
	file: {
		new (title: string): File
	}
	category: {
		new (title: string): Category
	}
	stream: {
		new (streams: string | string[], config: {
			userAgent: string
			since?: Date | XDate | string
			onopen?: (() => void)
			onerror?: ((evt: MessageEvent) => void)
		}): Stream

		recentchange(filter: any, action: ((data: any) => any)): Stream
	}
	date: {
		new (...args: any[]): XDate
		loadLocaleData(data: any): void
		getMonthName(monthNum: number): string
		getMonthNameAbbrev(monthNum: number): string
		getDayName(dayNum: number): string
		getDayNameAbbrev(dayNum: number): string
	}
	wikitext: {
		new (text: string): Wikitext
		parseTemplates(wikitext: string, config: TemplateConfig): Template[]
		parseTable(text: string): {[column: string]: string}[]
		parseSections(text: string): Section[]
	}
	user: {
		new (username: string): User
	}

	static Error = MwnError

	static log = log

	/***************** CONSTRUCTOR ********************/

	/**
	 * Constructs a new bot instance
	 * It is advised to create one bot instance for every API to use
	 * A bot instance has its own state (e.g. tokens) that is necessary for some operations
	 *
	 * @param {Object} [customOptions] - Custom options
	 */
	constructor(customOptions?: MwnOptions) {

		this.state = {};
		this.loggedIn = false;

		/**
		 * Bot instance's edit token. Initially set as an invalid token string
		 * so that the badtoken handling logic is invoked if the token is
		 * not set before a query is sent.
		 */
		this.csrfToken = '%notoken%';

		/**
		 * Default options.
		 * Should be immutable
		 */
		this.defaultOptions = {
			// suppress messages, except for error messages and warnings
			silent: false,

			// site API url, example "https://en.wikipedia.org/w/api.php"
			apiUrl: null,

			// User agent string
			userAgent: 'mwn',

			// bot login username and password, setup using Special:BotPasswords
			username: null,
			password: null,

			// OAuth credentials
			OAuthCredentials: {
				consumerToken: null,
				consumerSecret: null,
				accessToken: null,
				accessSecret: null
			},

			// max number of times to retry the same request on errors due to
			// maxlag, wiki being in readonly mode, and other transient errors
			maxRetries: 3,

			// milliseconds to pause before retrying after a transient error
			retryPause: 5000,

			// Bot emergency shutoff options
			shutoff: {
				intervalDuration: 10000,
				page: null,
				condition: /^\s*$/,
				onShutoff: function () {}
			},

			// default parameters included in every API request
			defaultParams: {
				format: 'json',
				formatversion: '2',
				maxlag: 5
			},

			// suppress logging of warnings received from the API
			suppressAPIWarnings: false,

			// options for the edit() function
			editConfig: {
				// max number of retries on edit conflicts
				conflictRetries: 2,
				// suppress warning on an edit resulting in no change to the page
				suppressNochangeWarning: false,
				// abort edit if exclusionRegex matches on the page content
				exclusionRegex: null
			},

			// options for logging, see semlog documentation
			semlog: {
				printDateTime: true
			}
		};

		/**
		 * Actual, current options of the bot instance
		 * Mix of the default options, the custom options and later changes
		 *
		 * @type {Object}
		 */
		if (typeof customOptions === 'string') {
			// Read options from file (JSON):
			try {
				customOptions = JSON.parse(fs.readFileSync(customOptions).toString());
			} catch (err) {
				throw new Error(`Failed to read or parse JSON config file: ` + err);
			}
		}
		this.options = mergeDeep1(this.defaultOptions, customOptions);

		/**
		 * Cookie jar for the bot instance - holds session and login cookies
		 *
		 * @type {tough.CookieJar}
		 */
		this.cookieJar = new tough.CookieJar();

		/**
		 * Request options for the axios library.
		 * Change the defaults using setRequestOptions()
		 *
		 * @type {Object}
		 */
		this.requestOptions = mergeDeep1({
			responseType: 'json'
		}, mwn.requestDefaults);

		/**
		 * Emergency shutoff config
		 * @type {{hook: ReturnType<typeof setTimeout>, state: boolean}}
		 */
		this.shutoff = {
			state: false,
			hook: null
		};

		// set up any semlog options
		semlog.updateConfig(this.options.semlog || {});

		/**
		 * Classes associated with the bot instance
		 */
		this.title = MwnTitle(this);
		this.page = MwnPage(this);
		this.category = MwnCategory(this);
		this.file = MwnFile(this);
		this.user = MwnUser(this);
		this.wikitext = MwnWikitext(this);
		this.stream = MwnStream(this, mwn);
		this.date = MwnDate(this);
	}


	/**
	 * Initialize a bot object. Login to the wiki and fetch editing tokens.
	 * Also fetches the site data needed for parsing and constructing title objects.
	 * @param {Object} config - Bot configurations, including apiUrl, and either the
	 * username and password or the OAuth credentials
	 * @returns {Promise<mwn>} bot object
	 */
	static async init(config: MwnOptions): Promise<mwn> {
		const bot = new mwn(config);
		if (bot._usingOAuth()) {
			bot.initOAuth();
			await bot.getTokensAndSiteInfo();
		} else {
			await bot.loginGetToken();
		}
		return bot;
	}


	/**
	 * Set and overwrite mwn options
	 *
	 * @param {Object} customOptions
	 */
	setOptions(customOptions: MwnOptions) {
		this.options = mergeDeep1(this.options, customOptions);
	}

	/**
	 * Sets the API URL for MediaWiki requests
	 * This can be uses instead of a login, if no actions are used that require login.
	 *
	 * @param {string} apiUrl - API url to MediaWiki, e.g. https://en.wikipedia.org/w/api.php
	 */
	setApiUrl(apiUrl: string) {
		this.options.apiUrl = apiUrl;
	}

	/**
	 * Sets and overwrites the raw request options, used by the axios library
	 * See https://www.npmjs.com/package/axios
	 */
	setRequestOptions(customRequestOptions: RawRequestParams) {
		return mergeDeep1(this.requestOptions, customRequestOptions);
	}

	/**
	 * Set the default parameters to be sent in API calls.
	 * @param {Object} params - default parameters
	 */
	setDefaultParams(params: ApiParams) {
		this.options.defaultParams = merge(this.options.defaultParams, params);
	}

	/**
	 * Set your API user agent. See https://meta.wikimedia.org/wiki/User-Agent_policy
	 * Required for WMF wikis.
	 * @param {string} userAgent
	 */
	setUserAgent(userAgent: string) {
		this.options.userAgent = userAgent;
	}

	/**
	 * @private
	 * Determine if we're going to use OAuth for authentication
	 */
	_usingOAuth(): boolean {
		const creds = this.options.OAuthCredentials;
		if (typeof creds !== 'object') {
			return false;
		}
		if (!creds.consumerToken || !creds.consumerSecret ||
			!creds.accessToken || !creds.accessSecret) {
			return false;
		}
		return true;
	}

	/**
	 * Initialize OAuth instance
	 */
	initOAuth() {
		if (!this._usingOAuth()) {
			// without this, the API would return a confusing
			// mwoauth-invalid-authorization invalid consumer error
			throw new Error('[mwn] Invalid OAuth config');
		}
		try {
			this.oauth = new OAuth({
				consumer: {
					key: this.options.OAuthCredentials.consumerToken,
					secret: this.options.OAuthCredentials.consumerSecret
				},
				signature_method: 'HMAC-SHA1',
				// based on example at https://www.npmjs.com/package/oauth-1.0a
				hash_function(base_string, key) {
					return crypto
						.createHmac('sha1', key)
						.update(base_string)
						.digest('base64');
				}
			});
			this.usingOAuth = true;
		} catch (err) {
			throw new Error('Failed to construct OAuth object. ' + err);
		}
	}

	/**
	 * @private
	 * Get OAuth Authorization header
	 */
	makeOAuthHeader(params: OAuth.RequestOptions): OAuth.Header {
		return this.oauth.toHeader(this.oauth.authorize(params, {
			key: this.options.OAuthCredentials.accessToken,
			secret: this.options.OAuthCredentials.accessSecret
		}));
	}


	/************ CORE REQUESTS ***************/

	/**
	 * Executes a raw request
	 * Uses the axios library
	 */
	rawRequest(requestOptions: RawRequestParams): Promise<any> {

		if (!requestOptions.url) {
			const err = new mwn.Error({
				code: 'mwn_nourl',
				info: 'No URL provided for API request!',
				disableRetry: true,
				request: requestOptions
			});
			return Promise.reject(err);
		}
		return axios(mergeDeep1({}, mwn.requestDefaults, {
			method: 'get',
			headers: {
				'User-Agent': this.options.userAgent
			},
		}, requestOptions)).then(response => {
			return response.data;
		});

	}

	/**
	 * Executes a request with the ability to use custom parameters and custom
	 * request options
	 */
	async request(params: ApiParams, customRequestOptions: RawRequestParams = {}): Promise<any> {

		if (this.shutoff.state) {
			return this.rejectWithError({
				code: 'bot-shutoff',
				info: `Bot was shut off (check ${this.options.shutoff.page})`
			});
		}

		params = merge(this.options.defaultParams, params);

		const getOrPost = function (data: ApiParams) {
			if (data.action === 'query') {
				return 'get';
			}
			if (data.action === 'parse' && !data.text) {
				return 'get';
			}
			return 'post';
		};

		let requestOptions: RawRequestParams = mergeDeep1({
			url: this.options.apiUrl,
			method: getOrPost(params),

			// retryNumber isn't actually used by the API, but this is
			// included here for tracking our maxlag retry count.
			retryNumber: 0

		}, this.requestOptions, customRequestOptions);

		const MULTIPART_THRESHOLD = 8000;
		let hasLongFields = false;

		// pre-process params:
		// Convert arrays to |-delimited strings. If one of the array items
		// itself contains a |, then use \x1f as delimiter and begin the string
		// with \x1f.
		// Adapted from mw.Api().preprocessParameters
		Object.entries(params).forEach(([key, val]) => {
			if (Array.isArray(val)) {
				if (!val.join('').includes('|')) {
					params[key] = val.join('|');
				} else {
					params[key] = '\x1f' + val.join('\x1f');
				}
			}
			if (val === false || val === undefined) {
				delete params[key];
			} else if (val === true) {
				params[key] = '1'; // booleans cause error with multipart/form-data requests
			} else if (String(params[key]).length > MULTIPART_THRESHOLD) {
				// use multipart/form-data if there are large fields, for better performance
				hasLongFields = true;
			}
		});

		if (requestOptions.method === 'post') {
			// Shift the token to the end of the query string, to prevent
			// incomplete data sent from being accepted meaningfully by the server
			if (params.token) {
				let token = params.token;
				delete params.token;
				params.token = token;
			}

			const contentTypeGiven = customRequestOptions.headers &&
				customRequestOptions.headers['Content-Type'];

			if ((hasLongFields && (!contentTypeGiven || contentTypeGiven === 'mulipart/form-data')) || contentTypeGiven === 'multipart/form-data') {
				// console.log('sending multipart POST request for action=' + params.action);
				// use multipart/form-data
				let form = new formData();
				for (let [key, val] of Object.entries(params)) {
					if (val instanceof Object && 'stream' in val) { // TypeScript facepalm
						form.append(key, val.stream, val.name);
					} else {
						form.append(key, val);
					}
				}
				requestOptions.data = form;
				requestOptions.headers = await new Promise((resolve, reject) => {
					form.getLength((err, length) => {
						if (err) {
							reject('Failed to get length of stream: ' + err);
						}
						resolve({
							...requestOptions.headers,
							...form.getHeaders(),
							'Content-Length': length
						});
					});
				});
			} else {
				// console.log('sending POST request for action=' + params.action);
				// use application/x-www-form-urlencoded (default)
				// requestOptions.data = params;
				requestOptions.data = Object.entries(params).map(([key, val]) => {
					return encodeURIComponent(key) + '=' + encodeURIComponent(val as string);
				}).join('&');
			}
		} else {
			// console.log('sending GET request for action=' + params.action);
			// axios takes care of stringifying to URL query string
			requestOptions.params = params;
		}

		if (this.usingOAuth) {
			// OAuth authentication
			requestOptions.headers = {
				...requestOptions.headers,
				...this.makeOAuthHeader({
					url: requestOptions.url,
					method: requestOptions.method,
					data: requestOptions.data instanceof formData ? {} : params
				})
			};
		} else {
			// BotPassword authentication
			requestOptions.jar = this.cookieJar;
			requestOptions.withCredentials = true;
		}

		return this.rawRequest(requestOptions).then((response) => {
			if (typeof response !== 'object') {
				if (params.format !== 'json') {
					throw new Error('must use format=json');
				}
				return Promise.reject(new mwn.Error({
					code: 'invalidjson',
					info: 'No valid JSON response',
					response: response
				}));
			}

			const refreshTokenAndRetry = () => {
				return Promise.all(
					[this.getTokenType(params.action as string), this.getTokens()]
				).then(([tokentype]) => {
					if (!tokentype || !this.state[tokentype + 'token']) {
						return this.dieWithError(response, requestOptions);
					}
					params.token = this.state[ tokentype + 'token' ];
					return this.request(params, customRequestOptions);
				});
			};

			// See https://www.mediawiki.org/wiki/API:Errors_and_warnings#Errors
			if (response.error) {

				if (requestOptions.retryNumber < this.options.maxRetries) {
					customRequestOptions.retryNumber = requestOptions.retryNumber + 1;

					switch (response.error.code) {

						// This will not work if the token type to be used is defined by an
						// extension, and not a part of mediawiki core
						case 'badtoken':
							log(`[W] Encountered badtoken error, fetching new token and retrying`);
							return refreshTokenAndRetry();

						case 'readonly':
						case 'maxlag':
							// Handle maxlag, see https://www.mediawiki.org/wiki/Manual:Maxlag_parameter
							log(`[W] Encountered ${response.error.code} error, waiting for ${this.options.retryPause/1000} seconds before retrying`);
							return this.sleep(this.options.retryPause).then(() => {
								return this.request(params, customRequestOptions);
							});

						case 'assertbotfailed':
						case 'assertuserfailed':
							// this shouldn't have happened if we're using OAuth
							if (this.usingOAuth) {
								return this.dieWithError(response, requestOptions);
							}

							// Possibly due to session loss: retry after logging in again
							log(`[W] Received ${response.error.code}, attempting to log in and retry`);
							return this.login().then(() => {
								if (params.token) {
									return refreshTokenAndRetry();
								} else {
									return this.request(params, customRequestOptions);
								}
							});

						default:
							return this.dieWithError(response, requestOptions);
					}

				} else {
					return this.dieWithError(response, requestOptions);
				}

			}

			if (response.warnings && !this.options.suppressAPIWarnings) {
				for (let [key, info] of Object.entries(response.warnings)) {
					log(`[W] Warning received from API: ${key}: ${info.warnings}`);
				}
			}

			return response;

		}, error => {

			if (!error.disableRetry && requestOptions.retryNumber < this.options.maxRetries) {
				// error might be transient, give it another go!
				log(`[W] Encountered ${error}, retrying in ${this.options.retryPause/1000} seconds`);
				customRequestOptions.retryNumber = requestOptions.retryNumber + 1;
				return this.sleep(this.options.retryPause).then(() => {
					return this.request(params, customRequestOptions);
				});
			}

			error.request = requestOptions;
			return Promise.reject(error);
		});

	}

	/** @private */
	dieWithError(response: any, requestOptions: RawRequestParams) {
		let errorData = Object.assign(response.error, {
			// Enhance error object with additional information:
			// the full response
			response: response,
			// the original request, should the client want to retry the request
			request: requestOptions
		});
		return Promise.reject(new mwn.Error(errorData));
	}


	/************** CORE FUNCTIONS *******************/


	/**
	 * Executes a Login
	 *
	 * @see https://www.mediawiki.org/wiki/API:Login
	 *
	 * @returns {Promise}
	 */
	login(loginOptions?: {
		username?: string
		password?: string
		apiUrl?: string
	}) {

		this.options = merge(this.options, loginOptions);

		if (!this.options.username || !this.options.password || !this.options.apiUrl) {
			return Promise.reject(new Error('Incomplete login credentials!'));
		}

		let loginString = this.options.username + '@' + this.options.apiUrl.split('/api.php').join('');

		// Fetch login token, also at the same time, fetch info about namespaces for Title
		return this.request({
			action: 'query',
			meta: 'tokens|siteinfo',
			type: 'login',
			siprop: 'general|namespaces|namespacealiases',

			// unset the assert parameter (in case it's given by the user as a default
			// option), as it will invariably fail until login is performed.
			assert: undefined

		}).then((response) => {

			if (!response.query || !response.query.tokens || !response.query.tokens.logintoken) {
				let err = new mwn.Error({
					code: 'mwn_notoken',
					info: 'Failed to get login token',
					response,
				});
				log('[E] [mwn] Login failed with invalid response: ' + loginString);
				return Promise.reject(err);
			}
			this.state = merge(this.state, response.query.tokens);

			this.title.processNamespaceData(response);

			return this.request({
				action: 'login',
				lgname: this.options.username,
				lgpassword: this.options.password,
				lgtoken: response.query.tokens.logintoken,
				assert: undefined // as above, assert won't work till the user is logged in
			});

		}).then((response) => {
			if (response.login && response.login.result === 'Success') {
				this.state = merge(this.state, response.login);
				this.loggedIn = true;
				if (!this.options.silent) {
					log('[S] [mwn] Login successful: ' + loginString);
				}
				return this.state;
			}

			let reason = 'Unknown reason';
			if (response.login && response.login.result) {
				reason = response.login.result;
			}
			let err = new mwn.Error({
				code: 'mwn_failedlogin',
				info: 'Could not log in: ' + reason,
				response
			});
			log('[E] [mwn] Login failed: ' + loginString);
			return Promise.reject(err);

		});

	}

	/**
	 * Log out of the account
	 */
	logout(): Promise<void> {
		return this.request({
			action: 'logout',
			token: this.csrfToken
		}).then(() => { // returns an empty response if successful
			this.loggedIn = false;
			this.cookieJar.removeAllCookiesSync();
			this.state = {};
			this.csrfToken = '%notoken%';
		});
	}

	/**
	 * Gets namespace-related information for use in title nested class.
	 * This need not be used if login() is being used. This is for cases
	 * where mwn needs to be used without logging in.
	 * @returns {Promise<void>}
	 */
	getSiteInfo(): Promise<void> {
		return this.request({
			action: 'query',
			meta: 'siteinfo',
			siprop: 'general|namespaces|namespacealiases'
		}).then(result => {
			this.title.processNamespaceData(result);
		});
	}

	/**
	 * Get tokens and saves them in this.state
	 * @returns {Promise<void>}
	 */
	getTokens(): Promise<void> {
		return this.request({
			action: 'query',
			meta: 'tokens|userinfo',
			type: 'csrf|createaccount|login|patrol|rollback|userrights|watch',
			uiprop: 'rights'
		}).then((response: ApiResponse) => {
			// console.log('getTokens response:', response);
			if (response.query && response.query.tokens) {
				this.csrfToken = response.query.tokens.csrftoken;
				this.state = merge(this.state, response.query.tokens);
			} else {
				let err = new mwn.Error({
					code: 'mwn_notoken',
					info: 'Could not get token',
					response
				});
				return Promise.reject(err);
			}
			if (response.query.userinfo.rights.includes('apihighlimit')) {
				this.hasApiHighLimit = true;
			}
		});
	}

	/**
	 * Gets an edit token (also used for most other actions
	 * such as moving and deleting)
	 * This is only compatible with MW >= 1.24
	 * @returns {Promise<string>}
	 */
	getCsrfToken(): Promise<string> {
		return this.getTokens().then(() => this.csrfToken);
	}

	/**
	 * Get the tokens and siteinfo in one request
	 * @returns {Promise<void>}
	 */
	getTokensAndSiteInfo(): Promise<void> {
		return this.request({
			action: 'query',
			meta: 'siteinfo|tokens|userinfo',
			siprop: 'general|namespaces|namespacealiases',
			uiprop: 'rights',
			type: 'csrf|createaccount|login|patrol|rollback|userrights|watch'
		}).then((response: ApiResponse) => {
			this.title.processNamespaceData(response);
			if (response.query.userinfo.rights.includes('apihighlimit')) {
				this.hasApiHighLimit = true;
			}
			if (response.query && response.query.tokens) {
				this.csrfToken = response.query.tokens.csrftoken;
				this.state = merge(this.state, response.query.tokens);
			} else {
				let err = new mwn.Error({
					code: 'mwn_notoken',
					info: 'Could not get token',
					response
				});
				return Promise.reject(err);
			}
		});
	}

	/**
	 * Get type of token to be used with an API action
	 * @param {string} action - API action parameter
	 * @returns {Promise<string>}
	 */
	getTokenType(action: string): Promise<string> {
		return this.request({
			action: 'paraminfo',
			modules: action
		}).then(response => {
			return response.paraminfo.modules[0].parameters.find(p => p.name === 'token').tokentype;
		});
	}

	/**
	 * Combines Login  with getCsrfToken
	 *
	 * @param [loginOptions]
	 * @returns {Promise<void>}
	 */
	loginGetToken(loginOptions?: any): Promise<void> {
		return this.login(loginOptions).then(() => {
			return this.getTokens();
		});
	}

	/**
	 * Get the wiki's server time
	 * @returns {Promise<string>}
	 */
	getServerTime(): Promise<string> {
		return this.request({
			action: 'query',
			curtimestamp: true
		}).then(data => {
			return data.curtimestamp;
		});
	}

	/**
	 * Fetch and parse a JSON wikipage
	 * @param {string} title - page title
	 * @returns {Promise<Object>} parsed JSON object
	 */
	parseJsonPage(title: string): Promise<any> {
		return this.read(title).then(data => {
			try {
				return JSON.parse(data.revisions[0].content);
			} catch(e) {
				return this.rejectWithErrorCode('invalidjson');
			}
		});
	}

	/**
	 * Enable bot emergency shutoff
	 */
	enableEmergencyShutoff(shutoffOptions?: {
		page?: string
		intervalDuration?: number
		condition?: RegExp | ((text: string) => boolean)
		onShutoff?: ((text: string) => void)
	}): void {
		Object.assign(this.options.shutoff, shutoffOptions);

		this.shutoff.hook = setInterval(async () => {
			let text = await new this.page(this.options.shutoff.page).text();
			let cond = this.options.shutoff.condition;
			if (
				(cond instanceof RegExp && !cond.test(text)) ||
				(cond instanceof Function && !cond(text))
			) {
				this.shutoff.state = true;
				this.disableEmergencyShutoff();
				// user callback executed last, so that an error thrown by
				// it doesn't prevent the the above from being run
				this.options.shutoff.onShutoff(text);
			}
		}, this.options.shutoff.intervalDuration);
	}

	/**
	 * Disable emergency shutoff detection.
	 * Use this only if it was ever enabled.
	 */
	disableEmergencyShutoff() {
		clearInterval(this.shutoff.hook);
	}

	/***************** HELPER FUNCTIONS ******************/

	/**
	 * Reads the content and and meta-data of one (or many) pages.
	 * Content from the "main" slot is copied over to every revision object
	 * for easier referencing (`pg.revisions[0].content` can be used instead of
	 * `pg.revisions[0].slots.main.content`).
	 *
	 *
	 * @param {string|string[]|number|number[]} titles - for multiple pages use an array
	 * @param {Object} [options]
	 * @returns {Promise<ApiPage>}
	 */
	read(titles: string | string[] | number | number[], options?: ApiParams): Promise<ApiPage | ApiPage[]> {
		let pages = Array.isArray(titles) ? titles : [ titles ];
		let batchFieldName = typeof pages[0] === 'number' ? 'pageids' : 'titles';
		return this.massQuery({
			action: 'query',
			...makeTitles(titles),
			prop: 'revisions',
			rvprop: 'content|timestamp',
			rvslots: 'main',
			redirects: true,
			...options
		}, batchFieldName).then((jsons: Array<ApiResponse>) => {
			let data = jsons.reduce((data, json) => {
				json.query.pages.forEach((pg: ApiPage) => {
					if (pg.revisions) {
						pg.revisions.forEach((rev: ApiRevision) => {
							Object.assign(rev, rev.slots.main);
						});
					}
				});
				return data.concat(json.query.pages);
			}, []);
			return data.length === 1 ? data[0] : data;
		});
	}

	async *readGen(titles: string[], options?: ApiParams) {
		let massQueryResponses = this.massQueryGen({
			action: 'query',
			...makeTitles(titles),
			prop: 'revisions',
			rvprop: 'content|timestamp',
			rvslots: 'main',
			redirects: true,
			...options
		}, typeof titles[0] === 'number' ? 'pageids' : 'titles');

		for await (let response of massQueryResponses) {
			if (response && response.query && response.query.pages) {
				for (let pg of response.query.pages) {
					if (pg.revisions) {
						pg.revisions.forEach((rev: ApiRevision) => {
							Object.assign(rev, rev.slots.main);
						});
					}
					yield pg;
				}
			}
		}
	}

	// adapted from mw.Api().edit
	/**
	* @param {string|number|Title} title - Page title or page ID or Title object
	* @param {Function} transform - Callback that prepares the edit. It takes one
	* argument that is an { content: 'string: page content', timestamp: 'string:
	* time of last edit' } object. This function should return an object with
	* edit API parameters or just the updated text, or a promise providing one of
	* those.
	* @param {Object} [editConfig] - Overridden edit options. Available options:
	* conflictRetries, suppressNochangeWarning, exclusionRegex
	* @config conflictRetries - maximum number of times to retry edit after encountering edit
	* conflicts.
	* @config suppressNochangeWarning - don't show the warning when no change is actually
	* made to the page on an successful edit
	* @config exclusionRegex - don't edit if the page text matches this regex. Used for bot
	* per-page exclusion compliance.
	* @return {Promise<Object>} Edit API response
	*/
	edit(title: string | number,
		 transform: ((rev: {content: string, timestamp: string}) => string | ApiEditPageParams),
		 editConfig?: editConfigType): Promise<ApiEditResponse> {

		editConfig = editConfig || this.options.editConfig;

		let basetimestamp: string, curtimestamp: string;

		return this.request({
			action: 'query',
			...makeTitles(title),
			prop: 'revisions',
			rvprop: ['content', 'timestamp'],
			rvslots: 'main',
			formatversion: '2',
			curtimestamp: true
		}).then(data => {
			let page, revision, revisionContent;
			if (!data.query || !data.query.pages) {
				return this.rejectWithErrorCode('unknown');
			}
			page = data.query.pages[0];
			if (!page || page.invalid) {
				return this.rejectWithErrorCode('invalidtitle');
			}
			if (page.missing) {
				return this.rejectWithErrorCode('nocreate-missing');
			}
			revision = page.revisions[0];
			try {
				revisionContent = revision.slots.main.content;
			} catch(err) {
				return this.rejectWithErrorCode('unknown');
			}
			basetimestamp = revision.timestamp;
			curtimestamp = data.curtimestamp;

			if (editConfig.exclusionRegex && editConfig.exclusionRegex.test(revisionContent)) {
				return this.rejectWithErrorCode('bot-denied');
			}

			return transform({
				timestamp: revision.timestamp,
				content: revisionContent
			});

		}).then(returnVal => {
			if (typeof returnVal !== 'string' && !returnVal) {
				return { edit: { result: 'aborted' } };
			}
			const editParams = typeof returnVal === 'object' ? returnVal : {
				text: String(returnVal)
			};
			return this.request({
				action: 'edit',
				...makeTitle(title),
				formatversion: '2',
				basetimestamp: basetimestamp,
				starttimestamp: curtimestamp,
				nocreate: true,
				bot: true,
				token: this.csrfToken,
				...editParams
			});

		}).then(data => {
			if (data.edit && data.edit.nochange && !editConfig.suppressNochangeWarning) {
				log(`[W] No change from edit to ${data.edit.title}`);
			}
			return data.edit;
		}, err => {
			if (err.code === 'editconflict' && editConfig.conflictRetries > 0) {
				editConfig.conflictRetries--;
				return this.edit(title, transform, editConfig);
			} else {
				return Promise.reject(err);
			}
		});
	}

	/**
	 * Edit a page without loading it first. Straightforward version of `edit`.
	 * No edit conflict detection.
	 *
	 * @param {string|number}  title - title or pageid (as number)
	 * @param {string}  content
	 * @param {string}  [summary]
	 * @param {object}  [options]
	 * @returns {Promise}
	 */
	save(title: string | number, content: string, summary?: string, options?: ApiEditPageParams): Promise<ApiEditResponse> {
		return this.request(merge({
			action: 'edit',
			text: content,
			summary: summary,
			bot: true,
			token: this.csrfToken
		}, makeTitle(title), options)).then(data => data.edit);
	}

	/**
	 * Creates a new pages. Does not edit existing ones
	 *
	 * @param {string}  title
	 * @param {string}  content
	 * @param {string}  [summary]
	 * @param {object}  [options]
	 *
	 * @returns {Promise}
	 */
	create(title: string, content: string, summary?: string, options?: ApiEditPageParams): Promise<ApiEditResponse> {
		return this.request(merge({
			action: 'edit',
			title: String(title),
			text: content,
			summary: summary,
			createonly: true,
			bot: true,
			token: this.csrfToken
		}, options)).then(data => data.edit);
	}

	/**
	 * Post a new section to the page.
	 *
	 * @param {string|number} title - title or pageid (as number)
	 * @param {string} header
	 * @param {string} message wikitext message
	 * @param {Object} [additionalParams] Additional API parameters, e.g. `{ redirect: true }`
	 */
	newSection(title: string | number, header: string, message: string, additionalParams?: ApiEditPageParams): Promise<ApiEditResponse> {
		return this.request(merge({
			action: 'edit',
			section: 'new',
			summary: header,
			text: message,
			bot: true,
			token: this.csrfToken
		}, makeTitle(title), additionalParams)).then(data => data.edit);
	}


	/**
	 * Deletes a page
	 *
	 * @param {string|number}  title - title or pageid (as number)
	 * @param {string}  [summary]
	 * @param {object}  [options]
	 * @returns {Promise}
	 */
	delete(title: string | number, summary: string, options?: ApiDeleteParams): Promise<ApiResponse> {
		return this.request(merge({
			action: 'delete',
			reason: summary,
			token: this.csrfToken
		}, makeTitle(title), options)).then(data => data.delete);
	}

	/**
	 * Undeletes a page.
	 * Note: all deleted revisions of the page will be restored.
	 *
	 * @param {string}  title
	 * @param {string}  [summary]
	 * @param {object}  [options]
	 * @returns {Promise}
	 */
	undelete(title: string, summary: string, options?: ApiUndeleteParams): Promise<ApiResponse> {
		return this.request(merge({
			action: 'undelete',
			title: String(title),
			reason: summary,
			token: this.csrfToken
		}, options)).then(data => data.undelete);
	}

	/**
	 * Moves a new page
	 *
	 * @param {string}  fromtitle
	 * @param {string}  totitle
	 * @param {string}  [summary]
	 * @param {object}  [options]
	 */
	move(fromtitle: string, totitle: string, summary: string, options?: ApiMoveParams): Promise<ApiResponse> {
		return this.request(merge({
			action: 'move',
			from: fromtitle,
			to: totitle,
			reason: summary,
			movetalk: true,
			token: this.csrfToken
		}, options)).then(data => data.move);
	}

	/**
	 * Parse wikitext. Convenience method for 'action=parse'.
	 *
	 * @param {string} content Content to parse.
	 * @param {Object} additionalParams Parameters object to set custom settings, e.g.
	 *   redirects, sectionpreview.  prop should not be overridden.
	 * @return {Promise<string>}
	 */
	parseWikitext(content: string, additionalParams?: ApiParseParams): Promise<string> {
		return this.request(merge({
			text: String(content),
			formatversion: 2,
			action: 'parse',
			contentmodel: 'wikitext'
		}, additionalParams)).then(function(data) {
			return data.parse.text;
		});
	}

	/**
	 * Parse a given page. Convenience method for 'action=parse'.
	 *
	 * @param {string} title Title of the page to parse
	 * @param {Object} additionalParams Parameters object to set custom settings, e.g.
	 *   redirects, sectionpreview.  prop should not be overridden.
	 * @return {Promise<string>}
	 */
	parseTitle(title: string, additionalParams?: ApiParseParams): Promise<string> {
		return this.request(merge({
			page: String(title),
			formatversion: 2,
			action: 'parse',
			contentmodel: 'wikitext'
		}, additionalParams)).then( function ( data ) {
			return data.parse.text;
		});
	}


	/**
	 * Upload an image from a the local disk to the wiki.
	 * If a file with the same name exists, it will be over-written.
	 * @param {string} filepath
	 * @param {string} title
	 * @param {string} text
	 * @param {object} options
	 * @returns {Promise<Object>}
	 */
	upload(filepath: string, title: string, text: string, options?: ApiUploadParams): Promise<ApiResponse> {
		return this.request(merge({
			action: 'upload',
			file: {
				stream: fs.createReadStream(filepath),
				name: path.basename(filepath)
			},
			filename: title,
			text: text,
			ignorewarnings: true,
			token: this.csrfToken
		}, options), {
			headers: {
				'Content-Type': 'multipart/form-data'
			}
		}).then(data => {
			if (data.upload.warnings) {
				log(`[W] The API returned warnings while uploading to ${title}:`);
				log(data.upload.warnings);
			}
			return data.upload;
		});
	}


	/**
	 * Upload an image from a web URL to the wiki
	 * If a file with the same name exists, it will be over-written,
	 * to disable this behaviour, use `ignorewarning: false` in options.
	 * @param {string} url
	 * @param {string} title
	 * @param {string} text
	 * @param {Object} options
	 * @returns {Promise<Object>}
	 */
	uploadFromUrl(url: string, title: string, text: string, options?: ApiUploadParams): Promise<ApiResponse> {
		return this.request(merge({
			action: 'upload',
			url: url,
			filename: title || path.basename(url),
			text: text,
			ignorewarnings: true,
			token: this.csrfToken
		}, options)).then(data => {
			if (data.upload.warnings) {
				log('[W] The API returned warnings while uploading to ' + title + ':');
				log(data.upload.warnings);
			}
			return data.upload;
		});
	}

	/**
	 * Download an image from the wiki.
	 * If you're downloading multiple images, then for better efficiency, you may want
	 * to query the API for the urls of all images in one request, and follow that with
	 * running downloadFromUrl for each one.
	 * @param {string|number} file - title or page ID
	 * @param {string} [localname] - local path (with file name) to download to,
	 * defaults to current directory with same file name as on the wiki.
	 * @returns {Promise<void>}
	 */
	download(file: string | number, localname: string): Promise<void> {
		return this.request(merge({
			action: 'query',
			prop: 'imageinfo',
			iiprop: 'url'
		}, makeTitles(file))).then(data => {
			const url = data.query.pages[0].imageinfo[0].url;
			const name = new this.title(data.query.pages[0].title).getMainText();
			return this.downloadFromUrl(url, localname || name);
		});
	}

	/**
	 * Download an image from a URL.
	 * @param {string} url
	 * @param {string} [localname] - local path (with file name) to download to,
	 * defaults to current directory with same file name as that of the web image.
	 * @returns {Promise<void>}
	 */
	downloadFromUrl(url: string, localname: string): Promise<void> {
		return this.rawRequest({
			method: 'get',
			url: url,
			responseType: 'stream'
		}).then(response => {
			response.pipe(fs.createWriteStream(localname || path.basename(url)));
		});
	}

	/**
	 * Convenience method for `action=rollback`.
	 *
	 * @param {string|number} page - page title or page id as number or Title object
	 * @param {string} user
	 * @param {Object} [params] Additional parameters
	 * @return {Promise}
	 */
	rollback(page: string | number, user: string, params?: ApiRollbackParams): Promise<ApiResponse> {
		return this.request(merge({
			action: 'rollback',
			user: user,
			token: this.state.rollbacktoken
		}, makeTitle(page), params)).then(data => {
			return data.rollback;
		});
	}

	/**
	 * Purge one or more pages (max 500 for bots, 50 for others)
	 *
	 * @param {String[]|String|number[]|number} titles - page titles or page ids
	 * @param {Object} options
	 * @returns {Promise}
	 */
	purge(titles: string[] | string | number[] | number, options?: ApiPurgeParams): Promise<ApiResponse> {
		return this.request(merge({
			action: 'purge',
		}, makeTitles(titles), options)).then(data => data.purge);
	}

	/**
	 * Get pages with names beginning with a given prefix
	 * @param {string} prefix
	 * @param {Object} otherParams
	 *
	 * @returns {Promise<string[]>} - array of page titles (upto 5000 or 500)
	 */
	getPagesByPrefix(prefix: string, otherParams?: ApiQueryAllPagesParams): Promise<string[]> {
		const title = this.title.newFromText(prefix);
		if (!title) {
			throw new Error('invalid prefix for getPagesByPrefix');
		}
		return this.request(merge({
			"action": "query",
			"list": "allpages",
			"apprefix": title.title,
			"apnamespace": title.namespace,
			"aplimit": "max"
		}, otherParams)).then((data) => {
			return data.query.allpages.map(pg => pg.title);
		});
	}

	/**
	 * Get pages in a category
	 * @param {string} category - name of category, with or without namespace prefix
	 * @param {Object} [otherParams]
	 * @returns {Promise<string[]>}
	 */
	getPagesInCategory(category: string, otherParams?: ApiQueryCategoryMembersParams): Promise<string[]> {
		const title = this.title.newFromText(category, 14);
		return this.request(merge({
			"action": "query",
			"list": "categorymembers",
			"cmtitle": title.toText(),
			"cmlimit": "max"
		}, otherParams));
	}

	/**
	 * Search the wiki.
	 * @param {string} searchTerm
	 * @param {number} limit
	 * @param {("size"|"timestamp"|"worcount"|"snippet"|"redirectitle"|"sectiontitle"|
	 * "redirectsnippet"|"titlesnippet"|"sectionsnippet"|"categorysnippet")[]} props
	 * @param {Object} otherParams
	 * @returns {Promise<Object>}
	 */
	search(searchTerm: string, limit: number, props: ("size" | "timestamp" | "worcount" |
		"snippet" | "redirectitle" | "sectiontitle" | "redirectsnippet" | "titlesnippet" |
		"sectionsnippet" | "categorysnippet")[], otherParams?: ApiQuerySearchParams): Promise<ApiResponse> {
		return this.request(merge({
			action: 'query',
			list: 'search',
			srsearch: searchTerm,
			srlimit: limit,
			srprop: props || 'size|wordcount|timestamp',
		}, otherParams)).then(data => {
			return data.query.search;
		});
	}

	/************* BULK PROCESSING FUNCTIONS ************/


	/**
	 * Send an API query that automatically continues till the limit is reached.
	 *
	 * @param {Object} query - The API query
	 * @param {number} [limit=10] - limit on the maximum number of API calls to go through
	 * @returns {Promise<Object[]>} - resolved with an array of responses of individual calls.
	 */
	continuedQuery(query?: ApiParams, limit: number = 10): Promise<ApiResponse[]> {
		let responses = [];
		let callApi = (query, count) => {
			return this.request(query).then(response => {
				if (!this.options.silent) {
					log(`[+] Got part ${count} of continuous API query`);
				}
				responses.push(response);
				if (response.continue && count < limit) {
					return callApi(merge(query, response.continue), count + 1);
				} else {
					return responses;
				}
			});
		};
		return callApi(query, 1);
	}

	/**
	 * Generator to iterate through API response continuations.
	 * @generator
	 * @param {Object} query
	 * @param {number} [limit=10]
	 * @yields {Object} a single page of the response
	 */
	async *continuedQueryGen(query?: ApiParams, limit: number=10) {
		let response = { continue: {} };
		for (let i = 0; i < limit; i++) {
			if (response.continue) {
				response = await this.request(merge(query, response.continue));
				yield response;
			}
		}
	}

	/**
	 * Function for using API action=query with more than 50/500 items in multi-
	 * input fields.
	 *
	 * Multi-value fields in the query API take multiple inputs as an array
	 * (internally converted to a pipe-delimted string) but with a limit of 500
	 * (or 50 for users without apihighlimits).
	 * Example: the fields titles, pageids and revids in any query, ususers in
	 * list=users.
	 *
	 * This function allows you to send a query as if this limit didn't exist.
	 * The array given to the multi-input field is split into batches and individual
	 * queries are sent sequentially for each batch.
	 * A promise is returned finally resolved with the array of responses of each
	 * API call.
	 *
	 * The API calls are made via POST instead of GET to avoid potential 414 (URI
	 * too long) errors.
	 *
	 * @param {Object} query - the query object, the multi-input field should
	 * be an array
	 * @param {string} [batchFieldName=titles] - the name of the multi-input field
	 *
	 * @returns {Promise<Object[]>} - promise resolved when all the API queries have
	 * settled, with the array of responses.
	 */
	massQuery(query?: ApiParams, batchFieldName='titles'): Promise<ApiResponse[]> {
		let batchValues = query[batchFieldName];
		if (!Array.isArray(batchValues)) {
			throw new Error(`massQuery: batch field in query must be an array`);
		}
		const limit = this.hasApiHighLimit ? 500 : 50;
		const numBatches = Math.ceil(batchValues.length / limit);
		let batches = new Array(numBatches);
		for (let i = 0; i < numBatches - 1; i++) {
			batches[i] = new Array(limit);
		}
		batches[numBatches - 1] = new Array(batchValues.length % limit);
		for (let i = 0; i < batchValues.length; i++) {
			batches[Math.floor(i/limit)][i % limit] = batchValues[i];
		}
		let responses = new Array(numBatches);
		return new Promise((resolve) => {
			const sendQuery = (idx: number) => {
				if (idx === numBatches) {
					return resolve(responses);
				}
				query[batchFieldName] = batches[idx];
				this.request(query, { method: 'post' }).then(response => {
					responses[idx] = response;
				}, err => {
					responses[idx] = err;
				}).finally(() => {
					sendQuery(idx + 1);
				});
			};
			sendQuery(0);
		});
	}

	/**
	 * Generator version of massQuery(). Iterate through pages of API results.
	 * @param {Object} query
	 * @param {string} [batchFieldName=titles]
	 * @param {number} [batchSize]
	 */
	async *massQueryGen(query: ApiParams, batchFieldName: string = 'titles', batchSize?: number) {
		let batchValues = query[batchFieldName];
		if (!Array.isArray(batchValues)) {
			throw new Error(`massQuery: batch field in query must be an array`);
		}
		const limit = batchSize || this.hasApiHighLimit ? 500 : 50;
		const batches = arrayChunk(batchValues, limit);
		const numBatches = batches.length;

		for (let i = 0; i < numBatches; i++) {
			query[batchFieldName] = batches[i];
			yield await this.request(query, { method: 'post' });
		}
	}

	/**
	 * Execute an asynchronous function on a large number of pages (or other arbitrary
	 * items). Designed for working with promises.
	 *
	 * @param {Array} list - list of items to execute actions upon. The array would
	 * usually be of page names (strings).
	 * @param {Function} worker - function to execute upon each item in the list. Must
	 * return a promise.
	 * @param {number} [concurrency=5] - number of concurrent operations to take place.
	 * Set this to 1 for sequential operations. Default 5. Set this according to how
	 * expensive the API calls made by worker are.
	 * @param {number} [retries=0] - max number of times failing actions should be retried.
	 * @returns {Promise<Object>} - resolved when all API calls have finished, with object
	 * { failures: [ ...list of failed items... ] }
	 */
	batchOperation<T>(list: T[], worker: ((item: T, index: number) => Promise<any>), concurrency = 5, retries = 0): Promise<{failures: T[]}> {
		let counts = {
			successes: 0,
			failures: 0
		};
		let failures = [];
		let incrementSuccesses = () => {
			counts.successes++;
		};
		const incrementFailures = (idx: number) => {
			counts.failures++;
			failures.push(list[idx]);
		};
		const updateStatusText = () => {
			const percentageFinished = Math.round((counts.successes + counts.failures) / list.length * 100);
			const percentageSuccesses = Math.round(counts.successes / (counts.successes + counts.failures) * 100);
			const statusText = `[+] Finished ${counts.successes + counts.failures}/${list.length} (${percentageFinished}%) tasks, of which ${counts.successes} (${percentageSuccesses}%) were successful, and ${counts.failures} failed.`;
			if (!this.options.silent) {
				log(statusText);
			}
		};
		const numBatches = Math.ceil(list.length / concurrency);

		return new Promise((resolve) => {
			const sendBatch = (batchIdx: number) => {

				// Last batch
				if (batchIdx === numBatches - 1) {

					const numItemsInLastBatch = list.length - batchIdx * concurrency;
					const finalBatchPromises = new Array(numItemsInLastBatch);

					// Hack: Promise.allSettled requires NodeJS 12.9+
					// so we create a new array finalBatchSettledPromises containing promises
					// which are resolved irrespective of whether the corresponding
					// finalBatchPromises are resolved or rejected.
					let finalBatchSettledPromises = new Array(numItemsInLastBatch);

					for (let i = 0; i < numItemsInLastBatch; i++) {
						let idx = batchIdx * concurrency + i;
						finalBatchPromises[i] = worker(list[idx], idx);
						if (!ispromise(finalBatchPromises[i])) {
							throw new Error('batchOperation worker function must return a promise');
						}
						finalBatchSettledPromises[i] = new Promise((resolve) => {
							return finalBatchPromises[i].then(resolve, resolve);
						});
						finalBatchPromises[i].then(incrementSuccesses, incrementFailures.bind(null, idx))
							.finally(function() {
								updateStatusText();
								finalBatchSettledPromises[i] = Promise.resolve();
							});
					}
					Promise.all(finalBatchSettledPromises).then(() => {
						if (counts.failures !== 0 && retries > 0) {
							resolve(this.batchOperation(failures, worker, concurrency, retries - 1));
						} else {
							resolve({ failures });
						}
					});
					return;
				}

				for (let i = 0; i < concurrency; i++) {
					let idx = batchIdx * concurrency + i;

					const promise = worker(list[idx], idx);
					if (!ispromise(promise)) {
						throw new Error('batchOperation worker function must return a promise');
					}
					promise.then(incrementSuccesses, incrementFailures.bind(null, idx)).finally(() => {
						updateStatusText();
						// last item in batch: trigger the next batch's API calls
						if (i === concurrency - 1) {
							sendBatch(batchIdx + 1);
						}
					});
				}

			};
			sendBatch(0);
		});
	}

	/**
	 * Execute an asynchronous function on a number of pages (or other arbitrary items)
	 * sequentially, with a time delay between actions.
	 * Using this with delay=0 is same as using ApiBatchOperation with batchSize=1
	 * @param {Array} list
	 * @param {Function} worker - must return a promise
	 * @param {number} [delay=5000] - number of milliseconds of delay
	 * @param {number} [retries=0] - max number of times failing actions should be retried.
	 * @returns {Promise<Object>} - resolved when all API calls have finished, with object
	 * { failures: [ ...list of failed items... ] }
	 */
	seriesBatchOperation<T>(list: T[], worker: ((item: T, index: number) => Promise<any>), delay=5000, retries=0): Promise<{counts: any, failures: T[]}> {
		let counts = {
			successes: 0,
			failures: 0
		};
		let failures = [];
		const incrementSuccesses = () => {
			counts.successes++;
		};
		const incrementFailures = (idx: number) => {
			counts.failures++;
			failures.push(list[idx]);
		};
		const updateStatusText = () => {
			const percentageFinished = Math.round((counts.successes + counts.failures) / list.length * 100);
			const percentageSuccesses = Math.round(counts.successes / (counts.successes + counts.failures) * 100);
			const statusText = `[+] Finished ${counts.successes + counts.failures}/${list.length} (${percentageFinished}%) tasks, of which ${counts.successes} (${percentageSuccesses}%) were successful, and ${counts.failures} failed.`;
			if (!this.options.silent) {
				log(statusText);
			}
		};

		return new Promise((resolve) => {
			const trigger = (idx: number) => {
				if (list[idx] === undefined) { // reached the end
					if (counts.failures !== 0 && retries > 0) {
						return resolve(this.seriesBatchOperation(failures, worker, delay, retries - 1));
					} else {
						return resolve({ counts, failures });
					}
				}
				const promise = worker(list[idx], idx);
				if (!ispromise(promise)) {
					throw new Error('seriesBatchOperation worker function must return a promise');
				}
				promise.then(incrementSuccesses, incrementFailures.bind(null, idx))
					.finally(function() {
						updateStatusText();
						setTimeout(function() {
							trigger(idx + 1);
						}, delay);
					});
			};
			trigger(0);
		});
	}


	/********** SUPPLEMENTARY FUNCTIONS **************/


	/**
	 * Execute an ASK Query
	 * On a wiki that supports them, like semantic-mediawiki
	 *
	 * @param {string} query
	 * @param {string} [apiUrl]
	 * @param {object} [customRequestOptions]
	 *
	 * @returns {Promise}
	 */
	askQuery(query: string, apiUrl: string, customRequestOptions?: RawRequestParams): Promise<any> {

		apiUrl = apiUrl || this.options.apiUrl;

		let requestOptions = merge({
			method: 'get',
			url: apiUrl,
			responseType: 'json',
			params: {
				action: 'ask',
				format: 'json',
				query: query
			}
		}, customRequestOptions);

		return this.rawRequest(requestOptions);
	}


	/**
	 * Executes a SPARQL Query
	 * On a wiki that supports them, like wikidata
	 *
	 * @param {string} query
	 * @param {string} [endpointUrl]
	 * @param {object} [customRequestOptions]
	 *
	 * @returns {Promise}
	 */
	sparqlQuery(query: string, endpointUrl: string, customRequestOptions?: RawRequestParams): Promise<any> {

		endpointUrl = endpointUrl || this.options.apiUrl;

		let requestOptions = merge({
			method: 'get',
			url: endpointUrl,
			responseType: 'json',
			params: {
				format: 'json',
				query: query
			}
		}, customRequestOptions);

		return this.rawRequest(requestOptions);
	}

	/**
	 * Gets ORES predictions from revision IDs
	 * @param {string} endpointUrl
	 * @param {string[]} models
	 * @param {string[]|number[]|string|number} revisions  ID(s)
	 */
	oresQueryRevisions(endpointUrl: string, models: string[], revisions: string[] | number[] | string | number): Promise<any> {
		let response = {};
		const chunks = arrayChunk(
			(revisions instanceof Array) ? revisions : [revisions],
			50
		);
		return this.seriesBatchOperation(chunks, (chunk) => {
			return this.rawRequest({
				method: 'get',
				url: endpointUrl,
				params: {
					models: models.join('|'),
					revids: chunk.join('|')
				},
				responseType: 'json'
			}).then(data => {
				Object.assign(response, Object.values(data)[0].scores);
			});
		}, 0, 2).then(() => {
			return response;
		});
	}

	/**
	 * Query the top contributors to the article using the WikiWho API.
	 * This API has a throttling of 2000 requests a day.
	 * Supported for EN, DE, ES, EU, TR Wikipedias only
	 * @see https://api.wikiwho.net/
	 */
	async queryAuthors(title: string): Promise<{ totalBytes: number; users: ({ id: number; name: string; bytes: number; percent: number; })[]; }> {
		let langcodematch = this.options.apiUrl.match(/([^/]*?)\.wikipedia\.org/);
		if (!langcodematch || !langcodematch[1]) {
			throw new Error('WikiWho API is not supported for bot API url. Re-check.');
		}

		let json;
		try {
			json = await this.rawRequest({
				url: `https://api.wikiwho.net/${langcodematch[1]}/api/v1.0.0-beta/latest_rev_content/${encodeURIComponent(title)}/?editor=true`
			});
		} catch(err) {
			throw new Error(err && err.response && err.response.data
				&& err.response.data.Error);
		}

		const tokens = Object.values(json.revisions[0])[0].tokens;

		let data = {
			totalBytes: 0,
			users: []
		};
		let userdata: {
			[editor: string]: {
				name?: number
				bytes: number
				percent?: number
			}
		} = {};

		for (let token of tokens) {
			data.totalBytes += token.str.length;
			let editor = token['editor'];
			if (!userdata[editor]) {
				userdata[editor] = { bytes: 0 };
			}
			userdata[editor].bytes += token.str.length;
			if (editor.startsWith('0|')) { // IP
				userdata[editor].name = editor.slice(2);
			}
		}

		Object.entries(userdata).map(([userid, {bytes}]) => {
			userdata[userid].percent = bytes / data.totalBytes;
			if (userdata[userid].percent < 0.02) {
				delete userdata[userid];
			}
		});

		await this.request({
			"action": "query",
			"list": "users",
			"ususerids": Object.keys(userdata).filter(us => !us.startsWith('0|')) // don't lookup IPs
		}).then(json => {
			json.query.users.forEach(us => {
				userdata[String(us.userid)].name = us.name;
			});
		});

		data.users = Object.entries(userdata).map(([userid, {bytes, name, percent}]) => {
			return {
				id: userid,
				name: name,
				bytes: bytes,
				percent: percent
			};
		}).sort((a, b) => {
			return a.bytes < b.bytes ? 1 : -1;
		});

		return data;
	}

	/**
	* Promisified version of setTimeout
	* @param {number} duration - of sleep in milliseconds
	*/
	sleep(duration: number): Promise<void> {
		return new Promise(resolve => {
			setTimeout(resolve, duration);
		});
	}

	/**
	 * Returns a promise rejected with an error object
	 * @private
	 * @param {string} errorCode
	 * @returns {Promise<mwn.Error>}
	 */
	rejectWithErrorCode(errorCode: string): Promise<MwnError> {
		return Promise.reject(new mwn.Error({
			code: errorCode
		}));
	}

	rejectWithError(errorConfig: MwnErrorConfig): Promise<MwnError> {
		return Promise.reject(new mwn.Error(errorConfig));
	}

}

mwn.requestDefaults = {
	headers: {
		'Accept-Encoding': 'gzip'
	},

	// keep-alive pools and reuses TCP connections, for better performance
	httpAgent: new http.Agent({ keepAlive: true }),
	httpsAgent: new https.Agent({ keepAlive: true }),

	timeout: 60000, // 60 seconds
};

// Bind static utilities
Object.assign(mwn, static_utils);

// Expose semlog
mwn.log = log;


/**** Private utilities ****/

/** Check whether object looks like a promises-A+ promise, from https://www.npmjs.com/package/is-promise */
function ispromise(obj: any) {
	return !!obj && (typeof obj === 'object' || typeof obj === 'function') &&
		typeof obj.then === 'function';
}

/** Check whether an object is plain object, from https://github.com/sindresorhus/is-plain-obj/blob/master/index.js */
function isplainobject(value: any) {
	if (Object.prototype.toString.call(value) !== '[object Object]') {
		return false;
	}
	const prototype = Object.getPrototypeOf(value);
	return prototype === null || prototype === Object.prototype;
}

/**
 * Simple wrapper around Object.assign to merge objects. null and undefined
 * arguments in argument list will be ignored.
 *
 * @param {...Object} objects - if the same property exists on multiple
 * objects, the value on the rightmost one will be kept in the output.
 * @returns {Object} - Merged object
 */
function merge(...objects: object[]) {
	// {} used as first parameter as this object is mutated by default
	return Object.assign({}, ...objects);
}

/**
 * Merge objects deeply to 1 level. Object properties like params, data,
 * headers get merged. But not any object properties within them.
 * Arrays are not merged, but over-written (as if it were a primitive)
 * The first object is mutated and returned.
 * @param {...Object} objects - any number of objects
 * @returns {Object}
 */
function mergeDeep1(...objects: object[]) {
	let args = [...objects].filter(e => e); // skip null/undefined values
	for (let options of args.slice(1)) {
		for (let [key, val] of Object.entries(options)) {
			if (isplainobject(val)) {
				args[0][key] = merge(args[0][key], val);
				// this can't be written as Object.assign(args[0][key], val)
				// as args[0][key] could be undefined
			} else {
				args[0][key] = val;
			}
		}
	}
	return args[0];
}

/**
 * @param {Array} arr
 * @param {number} size
 */
function arrayChunk(arr: any[], size: number) {
	const numChunks = Math.ceil(arr.length / size);
	let result = new Array(numChunks);
	for (let i=0; i<numChunks; i++) {
		result[i] = arr.slice(i * size, (i + 1) * size);
	}
	return result;
}

function makeTitles(pages: string | string[] | number | number[]): {titles: string[]} | {pageids: number[]} {
	let pagesArray = Array.isArray(pages) ? pages : [pages];
	if (typeof pagesArray[0] === 'number') {
		return {pageids: pagesArray as number[]};
	} else {
		// .join casts array elements to strings and then joins
		return {titles: pagesArray as string[]};
	}
}

function makeTitle(page: string | number): {title: string} | {pageid: number} {
	if (typeof page === 'number') {
		return { pageid: page };
	} else {
		return { title: String(page) };
	}
}
