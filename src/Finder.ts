import * as vscode from 'vscode';
import { Namespace, Block } from './NS';
import { getSelection } from "./Locator";
import { Place} from './Place';
import { getFileContent } from './Workspace';
import { parse } from './MiddlwareParser';

export class Finder {
	document: vscode.TextDocument;
	selection: vscode.Range;
	path: string;
	line: string;

	constructor(document: vscode.TextDocument, selection: vscode.Range) {
		this.document = document;
		this.selection = selection;
		this.path = document.getText(selection).trim();
		this.path = this.path.replace(/^[\s{<!-]+|[-\s>}]+$/g, '');
		this.line = document.getText(document.lineAt(selection.start).range);
	}

	/**
	 * get place by selection
	 * @param selection
	 */
	public async getPlace(): Promise<Place> {
		let places = [
			this.pathHelperPlace,
			this.configPlace,
			this.langPlace,
			this.envPlace,
			// this.middlewarePlace,
			this.controllerPlace,
			this.namespacePlace,
			this.bladePlace,
			this.staticPlace,
			this.inertiajsPlace,
			this.livewirePlace,
			this.componentPlace,
		];

		let place: Place = { path: '', location: '', uris: [] };
		for (let i = 0; i < places.length; i++) {
			place = await places[i](this, place, this.document, this.selection);
			if (place.path) {
				return place;
			}
		}

		return place;
	}

	/**
	* get path helper place
	*/
	pathHelperPlace(ctx: Finder, place: Place): Place {
		const pattern = /([\w^_]+)_path\(\s*(['"])([^'"]*)\2/;
		const match = pattern.exec(ctx.line);

		if ((Boolean)(match && match[3] === ctx.path)) {
			let prefix = match![1] + '/';
			if ('base/' === prefix) {
				prefix = '';
			} else if ('resource/' === prefix) {
				prefix = 'resources/';
			}

			place.path = prefix + ctx.path;
			return place;
		}

		return place;
	}

	/**
	 * get component place
	 *
	 */
	componentPlace(ctx: Finder, place: Place): Place {
		const pattern = /<\/?x-([^\/\s>]*)/;

		let match = pattern.exec(ctx.line);
		if (match && ctx.path.includes(match[1])) {
			let split = match[1].split(':');
			let vendor = '';
			// namespace or vendor
			if (3 === split.length) {
				// it's vendor
				if (split[0] === split[0].toLowerCase()) {
					vendor = split[0] + '/';
				}
			}

			place.path = split[split.length - 1];
			place.path = vendor + place.path.replace(/\./g, '/');
			place.path += '.php';

			return place;
	}

		return place;
	}


	/**
	 * get view place
	 *
	 */
	bladePlace(ctx: Finder, place: Place): Place {
		const patterns = [
			/view\(\s*(['"])([^'"]*)\1/,
			/[lL]ayout\(\s*(['"])([^'"]*)\1/,
			/\$view\s*=\s*(['"])([^'"]*)\1/,
			/View::exists\(\s*(['"])([^'"]*)\1/,
			/View::first[^'"]*(['"])([^'"]*)\1/,
			/view:\s*(['"])([^'"]*)\1/,
			/view\(\s*['"][^'"]*['"],\s*(['"])([^'"]*)\1/,
			/['"]layout['"]\s*=>\s*(['"])([^'"]*)\1/,
			/@include(If\b)?\(\s*(['"])([^'"]*)\2/,
			/@extends\(\s*(['"])([^'"]*)\1/,
			/@include(When|Unless\b)?\([^'"]+(['"])([^'"]+)/,
			/(resources\/views[^\s'"-]+)/,
		];

		const trasformFilename = (place: Place) => {
			let split = ctx.path.split(':');
			let vendor = '';
			// namespace or vendor
			if (3 === split.length) {
				// it's vendor
				if (split[0] === split[0].toLowerCase()) {
					vendor = split[0] + '/';
				}
			}

			place.path = split[split.length - 1];
			place.path = vendor + place.path.replace(/\./g, '/');
			if (place.path.endsWith('/blade/php')) {
				place.path = place.path.slice(0, place.path.length - '/blade/php'.length);
			}
			place.path += '.blade.php';

			return place;
		};

		for (const pattern of patterns) {
			let match = pattern.exec(ctx.line);
			if (match && match[match.length - 1] === ctx.path) {
				place = trasformFilename(place);

				return place;
			}
		}

		const multiViewsPatterns = [
			/@includeFirst\(\[(\s*['"][^'"]+['"]\s*[,]?\s*){2,}\]/,
			/@each\(['"][^'"]+['"]\s*,[^,]+,[^,]+,[^)]+/,
		];

		for (const pattern of multiViewsPatterns) {
			if (pattern.exec(ctx.line)) {
				place = trasformFilename(place);
				return place;
			}
		}

		return place;
	}

	/**
	 * get controller place
	 *
	 */
	controllerPlace(ctx: Finder, place: Place, document: vscode.TextDocument, selection: vscode.Range): Place {
		const blocks = (new Namespace(document)).blocks(selection);
		const controllerNotInPath = (-1 === ctx.line.indexOf('Controller'));
		if (0 === blocks.length && controllerNotInPath) {
			return place;
		}
		const pattern = /\[\s*(.*::class)\s*,\s*["']([^"']+)/;
		let match = pattern.exec(ctx.line);
		place.path = ctx.path;
		if (match) {
			place.path = match[1];
			place.location = match[2];
		}

		place = ctx.setControllerAction(ctx, blocks, place);
		place = ctx.setControllerNamespace(blocks ,place);

		place.path = place.path
			.replace('::class', '')
			.replace(/\\/g, '/') + '.php';

		return place;
	}

	/**
	 * get config place
	 */
	configPlace(ctx: Finder, place: Place): Place {
		const patterns = [
			/Config::[^'"]*(['"])([^'"]*)\1/,
			/config\([^'"]*(['"])([^'"]*)\1/g
		];

		for (const pattern of patterns) {
			let match;
			do {
				match = pattern.exec(ctx.line);
				if (match && match[2] === ctx.path) {
					let split = ctx.path.split('.');
					place.path = 'config/' + split[0] + '.php';
					if (2 <= split.length) {
						place.location = "(['\"]{1})" + split[1] + "\\1\\s*=>";
					}
					return place;
				}
			} while (match);
		}

		return place;
	}
	/**
	 * get language place
	 *
	 */
	langPlace(ctx: Finder, place: Place): Place {
		const patterns = [
			/__\([^'"]*(['"])([^'"]*)\1/,
			/@lang\([^'"]*(['"])([^'"]*)\1/,
			/trans\([^'"]*(['"])([^'"]*)\1/,
			/trans_choice\([^'"]*(['"])([^'"]*)\1/,
		];

		for (const pattern of patterns) {
			let match = pattern.exec(ctx.line);
			if (match && match[2] === ctx.path) {
				let split = ctx.path.split(':');
				let vendor = (3 === split.length) ? `/vendor/${split[0]}` : '';
				let keys = split[split.length - 1].split('.');

				place.path = `lang${vendor}/${keys[0]}.php`;
				if (2 <= keys.length) {
					place.location = "(['\"]{1})" + keys[1] + "\\1\\s*=>";
				}

				return place;
			}
		}

		return place;
	}

	/**
	 * get env place
	 */
	envPlace(ctx: Finder, place: Place): Place {
		const pattern = /env\(\s*(['"])([^'"]*)\1/;
		const match = pattern.exec(ctx.line);

		if ((Boolean)(match && match[2] === ctx.path)) {
			place.location = ctx.path;
			place.path = '.env';
		}

		return place;
	}

	/**
	 * get static place
	 */
	staticPlace(ctx: Finder, place: Place): Place {
		const split = ctx.path.split('.');
		const ext = split[split.length - 1].toLocaleLowerCase();

		let extensions: Array<string> = vscode.workspace.getConfiguration().get('laravelGoto.staticFileExtensions', []);
		extensions = extensions.map(ext => ext.toLowerCase());

		if (-1 !== extensions.indexOf(ext)) {
			let split = ctx.path.split('/');
			split = split.filter(d => (d !== '..' && d !== '.'));
			place.path = split.join('/');
		}
		return place;
	}

	/**
	 * get Inertia.js place
	 */
	inertiajsPlace(ctx: Finder, place: Place): Place {
		const patterns = [
			/Route::inertia\s*\([^,]+,\s*['"]([^'"]+)/,
			/Inertia::render\s*\(\s*['"]([^'"]+)/,
			/inertia\s*\(\s*['"]([^'"]+)/,
		];

		for (const pattern of patterns) {
			let match = pattern.exec(ctx.line);
			if ((Boolean)(match && match[1] === ctx.path)) {
				place.path = ctx.path;
				return place;
			}
		}

		return place;
	}

	/**
	 * get Livewire place
	 */
	 livewirePlace(ctx: Finder, place: Place): Place {
		const patterns = [
			/livewire:([^\s\/>]+)/,
			/@livewire\s*\(\s*['"]([^"']+)/,
		];

		const snakeToCamel = (str: string) =>
		str.toLowerCase()
		.replace(/([-_.][a-z])/g, group =>
		  group
			.toUpperCase()
			.replace('-', '')
			.replace('_', '')
			.replace('.', '/')
		);

		for (const pattern of patterns) {
			let match = pattern.exec(ctx.line);
			if (null === match) {
				continue;
			}

			if ((Boolean)(match && ctx.path.includes(match[1]))) {
				place.path = snakeToCamel(match[1]);
				place.path = place.path.charAt(0).toUpperCase() + place.path.slice(1) + '.php';
				return place;
			}
		}

		return place;
	}

	/**
	 * get namespace place
	 */
	namespacePlace(ctx: Finder, place: Place): Place {
		const pattern = /([A-Z][\w]+[\\])+[A-Z][\w]+/;
		const match = pattern.exec(ctx.path);

		if (match) {
			place.path = ctx.path + '.php';
		}

		return place;
	}

	/**
	 * get middleware place
	 */
	async middlewarePlace(ctx: Finder, place :Place): Promise<Place> {
		const httpKernel = await getFileContent('Http/Kernel.php');
		if (!httpKernel) {
			return place;
		}
		const middlewares = parse(httpKernel);

		const patterns = [
			/[m|M]iddleware\(\s*\[?\s*(['"][^'"]+['"]\s*,?\s*)+/,
			/['"]middleware['"]\s*=>\s*\s*\[?\s*(['"][^'"]+['"]\s*,?\s*){1,}\]?/,
		];
		for (const pattern of patterns) {
			if (!pattern.exec(ctx.line)) {
				continue;
			}
			let place = middlewares.get(ctx.path);
			if (place) {
				return place;
			}
		}

		return place;
	}

	/**
	 * set controller action
	 *
	 * @param place
	 */
	setControllerAction(ctx: Finder, blocks: Block[], place: Place): Place {
		if (-1 !== place.path.indexOf('@')) {
			let split = place.path.split('@');
			place.path = split[0];
			place.location = '@' + split[1];
		} else if (place.path.endsWith('::class')) {
			let action = getSelection(this.document, this.selection, "[]");
			if (action) {
				// HiController, 'index' => index
				place.location = '@' + this.document
					.getText(action)
					.split(',')[1]
					.replace(/['"]+/g, '')
					.trim();
			}
		} else if (blocks.length && !blocks[0].isNamespace) { // resource or controller route
			place.path = blocks[0].namespace;
			if (place.path !== ctx.path) {
				place.location = '@' + ctx.path;
			}
		}

		return place;
	}

	/**
	 * set controller namespace
	 *
	 * @param   {Place}  place  [place description]
	 *
	 * @return  {Place}         [return description]
	 */
	setControllerNamespace(blocks: Block[], place: Place): Place {
		// group namespace
		const isClass = place.path.endsWith('::class');
		if ('\\' !== place.path[0] || isClass) {
			if ('\\' === place.path[0]) {
				place.path = place.path.substring(1);
			}
			let namespace = Namespace.find(blocks);
			if (namespace) {
				place.path = namespace + '/' + place.path;
			}
		}
		return place;
	}
}
