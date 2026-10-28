(function() {
	// \0@oxc-project+runtime@0.155.0/helpers/esm/typeof.js
	function _typeof(o) {
		"@babel/helpers - typeof";
		return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
			return typeof o;
		} : function(o) {
			return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
		}, _typeof(o);
	}
	// \0@oxc-project+runtime@0.155.0/helpers/esm/toPrimitive.js
	function toPrimitive(t, r) {
		if ("object" != _typeof(t) || !t) return t;
		var e = t[Symbol.toPrimitive];
		if (void 0 !== e) {
			var i = e.call(t, r || "default");
			if ("object" != _typeof(i)) return i;
			throw new TypeError("@@toPrimitive must return a primitive value.");
		}
		return ("string" === r ? String : Number)(t);
	}
	// \0@oxc-project+runtime@0.155.0/helpers/esm/toPropertyKey.js
	function toPropertyKey(t) {
		var i = toPrimitive(t, "string");
		return "symbol" == _typeof(i) ? i : i + "";
	}
	// \0@oxc-project+runtime@0.155.0/helpers/esm/defineProperty.js
	function _defineProperty(e, r, t) {
		return (r = toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
			value: t,
			enumerable: !0,
			configurable: !0,
			writable: !0
		}) : e[r] = t, e;
	}
	// \0@oxc-project+runtime@0.155.0/helpers/esm/objectSpread2.js
	function ownKeys(e, r) {
		var t = Object.keys(e);
		if (Object.getOwnPropertySymbols) {
			var o = Object.getOwnPropertySymbols(e);
			r && (o = o.filter(function(r) {
				return Object.getOwnPropertyDescriptor(e, r).enumerable;
			})), t.push.apply(t, o);
		}
		return t;
	}
	function _objectSpread2(e) {
		for (var r = 1; r < arguments.length; r++) {
			var t = null != arguments[r] ? arguments[r] : {};
			r % 2 ? ownKeys(Object(t), !0).forEach(function(r) {
				_defineProperty(e, r, t[r]);
			}) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r) {
				Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r));
			});
		}
		return e;
	}
	// node_modules/zod/v4/core/util.js
	function getEnumValues(entries) {
		const numericValues = Object.values(entries).filter((v) => typeof v === "number");
		return Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
	}
	function joinValues(array, separator = "|") {
		return array.map((val) => stringifyPrimitive(val)).join(separator);
	}
	function jsonStringifyReplacer(_, value) {
		if (typeof value === "bigint") return value.toString();
		return value;
	}
	var Cached = class {
		constructor(getter) {
			this._getter = getter;
			this._value = void 0;
		}
		get value() {
			const getter = this._getter;
			if (getter !== void 0) {
				this._value = getter();
				this._getter = void 0;
			}
			return this._value;
		}
	};
	function cached(getter) {
		return new Cached(getter);
	}
	function nullish(input) {
		return input === null || input === void 0;
	}
	function cleanRegex(source) {
		const start = source.startsWith("^") ? 1 : 0;
		const end = source.endsWith("$") ? source.length - 1 : source.length;
		return source.slice(start, end);
	}
	function floatSafeRemainder(val, step) {
		const ratio = val / step;
		const roundedRatio = Math.round(ratio);
		const tolerance = 4 * Number.EPSILON * Math.max(Math.abs(ratio), 1);
		if (Math.abs(ratio - roundedRatio) < tolerance) return 0;
		return ratio - roundedRatio;
	}
	var EVALUATING = /* @__PURE__*/ Symbol("evaluating");
	function defineLazy(object, key, getter) {
		let value = void 0;
		Object.defineProperty(object, key, {
			get() {
				if (value === EVALUATING) return;
				if (value === void 0) {
					value = EVALUATING;
					value = getter();
				}
				return value;
			},
			set(v) {
				Object.defineProperty(object, key, { value: v });
			},
			configurable: true
		});
	}
	function assignProp(target, prop, value) {
		Object.defineProperty(target, prop, {
			value,
			writable: true,
			enumerable: true,
			configurable: true
		});
	}
	/**
	* Whichever object a def's `shape` currently answers from: the one the caller passed until the first read, the frozen copy after it.
	*
	* Its keys and descriptors read without invoking anything, which is what lets a discriminated union check its discriminator, and the cycle walk read a shape, without resolving a getter that references the schema being constructed. A def that answers `shape` from an accessor of its own has none.
	*/
	function rawShape(def) {
		const desc = Object.getOwnPropertyDescriptor(def, "shape");
		return (desc === null || desc === void 0 ? void 0 : desc.get) ? desc.get.raw : desc === null || desc === void 0 ? void 0 : desc.value;
	}
	function sourceShape(schema) {
		var _rawShape;
		return (_rawShape = rawShape(schema._zod.def)) !== null && _rawShape !== void 0 ? _rawShape : schema._zod.def.shape;
	}
	function deferProp(target, key, getter) {
		Object.defineProperty(target, key, {
			get() {
				const value = getter();
				assignProp(this, key, value);
				return value;
			},
			enumerable: true,
			configurable: true
		});
	}
	function putProp(target, key, value) {
		if (key in target) assignProp(target, key, value);
		else target[key] = value;
	}
	/**
	* Copies `keys` of `source`'s shape onto `target`, each value passed through `wrap`.
	*
	* A key the source has resolved is copied through now, so the derived shape states it outright and nothing has to resolve it to learn what it holds. A key the source still defers stays deferred, and reads back through the source's own `shape`, so it resolves once and both shapes get that one schema.
	*/
	function mirrorShape(target, source, keys, wrap) {
		const raw = sourceShape(source);
		for (const key of keys) {
			const desc = Object.getOwnPropertyDescriptor(raw, key);
			if (!desc.enumerable) continue;
			if (desc.get) deferProp(target, key, () => {
				const value = source._zod.def.shape[key];
				return wrap ? wrap(value, key) : value;
			});
			else putProp(target, key, wrap ? wrap(desc.value, key) : desc.value);
		}
	}
	function mirrorProps(target, source) {
		for (const key of Reflect.ownKeys(source)) {
			const desc = Object.getOwnPropertyDescriptor(source, key);
			if (!desc.enumerable) continue;
			if (desc.get) deferProp(target, key, () => source[key]);
			else putProp(target, key, desc.value);
		}
	}
	function mergeDefs(...defs) {
		const mergedDescriptors = {};
		for (const def of defs) {
			const descriptors = Object.getOwnPropertyDescriptors(def);
			Object.assign(mergedDescriptors, descriptors);
		}
		return Object.defineProperties({}, mergedDescriptors);
	}
	function esc(str) {
		return JSON.stringify(str);
	}
	function slugify(input) {
		return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
	}
	var captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
	function isObject(data) {
		return typeof data === "object" && data !== null && !Array.isArray(data);
	}
	var allowsEval = /* @__PURE__*/ cached(() => {
		var _navigator;
		if (globalConfig.jitless) return false;
		if (typeof navigator !== "undefined" && ((_navigator = navigator) === null || _navigator === void 0 || (_navigator = _navigator.userAgent) === null || _navigator === void 0 ? void 0 : _navigator.includes("Cloudflare"))) return false;
		try {
			new Function("");
			return true;
		} catch (_) {
			return false;
		}
	});
	function isPlainObject(o) {
		if (isObject(o) === false) return false;
		const ctor = o.constructor;
		if (ctor === void 0) return true;
		if (typeof ctor !== "function") return true;
		const prot = ctor.prototype;
		if (isObject(prot) === false) return false;
		if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) return false;
		return true;
	}
	function shallowClone(o) {
		if (isPlainObject(o)) return _objectSpread2({}, o);
		if (Array.isArray(o)) return [...o];
		if (o instanceof Map) return new Map(o);
		if (o instanceof Set) return new Set(o);
		return o;
	}
	var propertyKeyTypes = /* @__PURE__*/ new Set([
		"string",
		"number",
		"symbol"
	]);
	function escapeRegex(str) {
		return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}
	function clone(inst, def, params) {
		const cl = new inst._zod.constr(def !== null && def !== void 0 ? def : inst._zod.def);
		if (!def || (params === null || params === void 0 ? void 0 : params.parent)) cl._zod.parent = inst;
		return cl;
	}
	function normalizeParams(_params) {
		const params = _params;
		if (!params) return {};
		if (typeof params === "string") return { error: () => params };
		if ((params === null || params === void 0 ? void 0 : params.message) !== void 0) {
			if ((params === null || params === void 0 ? void 0 : params.error) !== void 0) throw new Error("Cannot specify both `message` and `error` params");
			params.error = params.message;
		}
		delete params.message;
		if (typeof params.error === "string") return _objectSpread2(_objectSpread2({}, params), {}, { error: () => params.error });
		return params;
	}
	function stringifyPrimitive(value) {
		if (typeof value === "bigint") return value.toString() + "n";
		if (typeof value === "string") return `"${value}"`;
		return `${value}`;
	}
	function optionalKeys(shape) {
		return Object.keys(shape).filter((k) => {
			return shape[k]._zod.optin !== void 0 && shape[k]._zod.optout === "optional";
		});
	}
	var NUMBER_FORMAT_RANGES = /*@__PURE__*/ (() => ({
		safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
		int32: [-2147483648, 2147483647],
		uint32: [0, 4294967295],
		float32: [-34028234663852886e22, 34028234663852886e22],
		float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
	}))();
	var BIGINT_FORMAT_RANGES = {
		int64: [/* @__PURE__*/ BigInt("-9223372036854775808"), /* @__PURE__*/ BigInt("9223372036854775807")],
		uint64: [/* @__PURE__*/ BigInt(0), /* @__PURE__*/ BigInt("18446744073709551615")]
	};
	function pick(schema, mask) {
		const currDef = schema._zod.def;
		const checks = currDef.checks;
		if (checks && checks.length > 0) throw new Error(".pick() cannot be used on object schemas containing refinements");
		const newShape = {};
		mirrorShape(newShape, schema, maskedKeys(schema, mask));
		return clone(schema, mergeDefs(currDef, {
			shape: newShape,
			checks: []
		}));
	}
	function maskedKeys(schema, mask) {
		const raw = sourceShape(schema);
		const keys = [];
		for (const key of Reflect.ownKeys(mask)) {
			var _Object$getOwnPropert;
			if (!((_Object$getOwnPropert = Object.getOwnPropertyDescriptor(raw, key)) === null || _Object$getOwnPropert === void 0 ? void 0 : _Object$getOwnPropert.enumerable)) throw new Error(`Unrecognized key: "${String(key)}"`);
			if (mask[key]) keys.push(key);
		}
		return keys;
	}
	function omit(schema, mask) {
		const currDef = schema._zod.def;
		const checks = currDef.checks;
		if (checks && checks.length > 0) throw new Error(".omit() cannot be used on object schemas containing refinements");
		const omitted = new Set(maskedKeys(schema, mask));
		const newShape = {};
		mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)).filter((key) => !omitted.has(key)));
		return clone(schema, mergeDefs(currDef, {
			shape: newShape,
			checks: []
		}));
	}
	function extend(schema, shape) {
		if (!isPlainObject(shape)) throw new Error("Invalid input to extend: expected a plain object");
		const checks = schema._zod.def.checks;
		if (checks && checks.length > 0) {
			const existingShape = sourceShape(schema);
			for (const key of Reflect.ownKeys(shape)) if (Object.getOwnPropertyDescriptor(existingShape, key) !== void 0) throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
		}
		return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
	}
	function extended(schema, shape) {
		const newShape = {};
		mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)));
		mirrorProps(newShape, shape);
		return newShape;
	}
	function safeExtend(schema, shape) {
		if (!isPlainObject(shape)) throw new Error("Invalid input to safeExtend: expected a plain object");
		return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
	}
	function merge(a, b) {
		var _b$_zod, _a$_zod$def$checks, _b$_zod$def$checks;
		if (!(b === null || b === void 0 || (_b$_zod = b._zod) === null || _b$_zod === void 0 ? void 0 : _b$_zod.def)) throw new Error("Invalid input to merge: expected an object schema. To merge a plain shape, use `.extend()`.");
		if ((_a$_zod$def$checks = a._zod.def.checks) === null || _a$_zod$def$checks === void 0 ? void 0 : _a$_zod$def$checks.length) throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
		const newShape = {};
		mirrorShape(newShape, a, Reflect.ownKeys(sourceShape(a)));
		mirrorShape(newShape, b, Reflect.ownKeys(sourceShape(b)));
		return clone(a, mergeDefs(a._zod.def, {
			shape: newShape,
			get catchall() {
				return b._zod.def.catchall;
			},
			checks: (_b$_zod$def$checks = b._zod.def.checks) !== null && _b$_zod$def$checks !== void 0 ? _b$_zod$def$checks : []
		}));
	}
	function partial(Class, schema, mask, name = "partial") {
		const checks = schema._zod.def.checks;
		if (checks && checks.length > 0) throw new Error(`.${name}() cannot be used on object schemas containing refinements`);
		const selected = mask ? new Set(maskedKeys(schema, mask)) : void 0;
		const newShape = {};
		mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), Class && ((value, key) => selected && !selected.has(key) ? value : new Class({
			type: "optional",
			innerType: value
		})));
		return clone(schema, mergeDefs(schema._zod.def, {
			shape: newShape,
			checks: []
		}));
	}
	function required(Class, schema, mask) {
		const selected = mask ? new Set(maskedKeys(schema, mask)) : void 0;
		const newShape = {};
		mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), (value, key) => selected && !selected.has(key) ? value : new Class({
			type: "nonoptional",
			innerType: value
		}));
		return clone(schema, mergeDefs(schema._zod.def, { shape: newShape }));
	}
	function aborted(x, startIndex = 0) {
		if (x.aborted === true) return true;
		for (let i = startIndex; i < x.issues.length; i++) {
			var _x$issues$i;
			if (((_x$issues$i = x.issues[i]) === null || _x$issues$i === void 0 ? void 0 : _x$issues$i.continue) !== true) return true;
		}
		return false;
	}
	function explicitlyAborted(x, startIndex = 0) {
		if (x.aborted === true) return true;
		for (let i = startIndex; i < x.issues.length; i++) {
			var _x$issues$i2;
			if (((_x$issues$i2 = x.issues[i]) === null || _x$issues$i2 === void 0 ? void 0 : _x$issues$i2.continue) === false) return true;
		}
		return false;
	}
	function prefixIssues(path, issues) {
		return issues.map((iss) => {
			var _a$path;
			var _a;
			(_a$path = (_a = iss).path) !== null && _a$path !== void 0 || (_a.path = []);
			iss.path.unshift(path);
			return iss;
		});
	}
	function unwrapMessage(message) {
		return typeof message === "string" ? message : message === null || message === void 0 ? void 0 : message.message;
	}
	/** The leading size checks of `defChecks` that set an upper bound, each paired with it. */
	function sizeCaps(defChecks) {
		const caps = [];
		for (const ch of defChecks !== null && defChecks !== void 0 ? defChecks : []) {
			var _ref, _d$maximum;
			const d = ch._zod.def;
			if (!/_(length|size)$|_equals$/.test(d.check)) break;
			const max = (_ref = (_d$maximum = d.maximum) !== null && _d$maximum !== void 0 ? _d$maximum : d.length) !== null && _ref !== void 0 ? _ref : d.size;
			if (max >= 0) caps.push([max, ch]);
		}
		return caps;
	}
	function attachSchema(issues, start, inst) {
		var _a;
		for (let i = start; i < issues.length; i++) {
			var _a$schema;
			(_a$schema = (_a = issues[i]).schema) !== null && _a$schema !== void 0 || (_a.schema = inst);
		}
	}
	function finalizeIssue(iss, ctx, config) {
		var _iss$inst, _iss$schema, _ref2, _ref3, _ref4, _ref5, _unwrapMessage, _iss$inst2, _iss$inst2$error, _ctx$error, _config$customError, _config$localeError, _full$path;
		var _a;
		const traits = (_iss$inst = iss.inst) === null || _iss$inst === void 0 || (_iss$inst = _iss$inst._zod) === null || _iss$inst === void 0 ? void 0 : _iss$inst.traits;
		if (traits === null || traits === void 0 ? void 0 : traits.has("$ZodType")) {
			var _a$schema2;
			if (traits.has("$ZodCheck")) (_a$schema2 = (_a = iss).schema) !== null && _a$schema2 !== void 0 || (_a.schema = iss.inst);
			else iss.schema = iss.inst;
		}
		const schemaError = iss.schema !== iss.inst ? (_iss$schema = iss.schema) === null || _iss$schema === void 0 || (_iss$schema = _iss$schema._zod.def) === null || _iss$schema === void 0 ? void 0 : _iss$schema.error : void 0;
		const message = iss.message ? iss.message : (_ref2 = (_ref3 = (_ref4 = (_ref5 = (_unwrapMessage = unwrapMessage((_iss$inst2 = iss.inst) === null || _iss$inst2 === void 0 || (_iss$inst2 = _iss$inst2._zod.def) === null || _iss$inst2 === void 0 || (_iss$inst2$error = _iss$inst2.error) === null || _iss$inst2$error === void 0 ? void 0 : _iss$inst2$error.call(_iss$inst2, iss))) !== null && _unwrapMessage !== void 0 ? _unwrapMessage : unwrapMessage(schemaError === null || schemaError === void 0 ? void 0 : schemaError(iss))) !== null && _ref5 !== void 0 ? _ref5 : unwrapMessage(ctx === null || ctx === void 0 || (_ctx$error = ctx.error) === null || _ctx$error === void 0 ? void 0 : _ctx$error.call(ctx, iss))) !== null && _ref4 !== void 0 ? _ref4 : unwrapMessage((_config$customError = config.customError) === null || _config$customError === void 0 ? void 0 : _config$customError.call(config, iss))) !== null && _ref3 !== void 0 ? _ref3 : unwrapMessage((_config$localeError = config.localeError) === null || _config$localeError === void 0 ? void 0 : _config$localeError.call(config, iss))) !== null && _ref2 !== void 0 ? _ref2 : "Invalid input";
		const full = {};
		for (const k of Object.keys(iss)) {
			if (k === "inst" || k === "schema" || k === "continue" || k === "input" || k === "__proto__") continue;
			full[k] = iss[k];
		}
		(_full$path = full.path) !== null && _full$path !== void 0 || (full.path = []);
		full.message = message;
		if (ctx === null || ctx === void 0 ? void 0 : ctx.reportInput) full.input = iss.input;
		return full;
	}
	var highSurrogate = /[\uD800-\uDBFF]/;
	function codePointLength(str) {
		const units = str.length;
		if (!highSurrogate.test(str)) return units;
		let count = units;
		for (let i = 0; i < units - 1; i++) if ((str.charCodeAt(i) & 64512) === 55296 && (str.charCodeAt(i + 1) & 64512) === 56320) {
			count--;
			i++;
		}
		return count;
	}
	function getLengthableOrigin(input) {
		if (Array.isArray(input)) return "array";
		if (typeof input === "string") return "string";
		return "unknown";
	}
	function parsedType(data) {
		const t = typeof data;
		switch (t) {
			case "number": return Number.isNaN(data) ? "nan" : "number";
			case "object": {
				if (data === null) return "null";
				if (Array.isArray(data)) return "array";
				const obj = data;
				if (obj && Object.getPrototypeOf(obj) !== Object.prototype && "constructor" in obj && obj.constructor) return obj.constructor.name;
			}
		}
		return t;
	}
	function issue(...args) {
		const [iss, input, inst] = args;
		if (typeof iss === "string") return {
			message: iss,
			code: "custom",
			input,
			inst
		};
		return _objectSpread2({}, iss);
	}
	/**
	* Installs a trait's members on its prototype. Each value builds that member for the instance on first read; the built value shadows the accessor as an own property, so a detached `const { parse } = schema` keeps working.
	*
	* Call this from a `proto` initializer, which runs once per prototype — never per instance.
	*/
	function members(proto, table) {
		for (const key in table) {
			const desc = Object.getOwnPropertyDescriptor(table, key);
			if (desc.get) Object.defineProperty(proto, key, _objectSpread2(_objectSpread2({}, desc), {}, { enumerable: false }));
			else defineBound(proto, key, desc.value);
		}
	}
	/** Shadows a prototype member with an own value, so a getter that builds from the instance runs once. */
	function own(inst, key, value, enumerable = true) {
		Object.defineProperty(inst, key, {
			configurable: true,
			writable: true,
			enumerable,
			value
		});
		return value;
	}
	/** Like {@link own}, for a member that was never an own data property and has to stay out of `Object.keys`. */
	function hide(inst, key, value) {
		return own(inst, key, value, false);
	}
	/** Adds members a table derives from the instance: each builds on first read and shadows as own data, and assignment shadows the same way, as when these were own properties. */
	/* @__NO_SIDE_EFFECTS__ */
	function derived(computes, table) {
		for (const key in computes) {
			const compute = computes[key];
			Object.defineProperty(table, key, {
				configurable: true,
				enumerable: true,
				get() {
					return own(this, key, compute(this));
				},
				set(value) {
					own(this, key, value);
				}
			});
		}
		return table;
	}
	function defineBound(proto, key, fn) {
		Object.defineProperty(proto, key, {
			configurable: true,
			get() {
				return this == null ? fn : own(this, key, fn.bind(this));
			},
			set(value) {
				own(this, key, value);
			}
		});
	}
	/** Returns the prototype to install on, or `undefined` if this group is already installed on it. */
	function claim(inst, sentinel) {
		const proto = Object.getPrototypeOf(inst);
		return sentinel in proto ? void 0 : proto;
	}
	var installing;
	var broke = false;
	var breaker = {
		configurable: true,
		get() {
			broke = true;
		}
	};
	/**
	* Installs a lazily-derived internal on the `_zod` prototype of `inst`'s
	* constructor, computed from the internals object itself and cached there on
	* first read. One accessor per constructor rather than one per instance.
	*/
	function defineLazyInternal(inst, key, compute) {
		const proto = Object.getPrototypeOf(inst._zod);
		if (key in proto && installing !== inst._zod) {
			installing = void 0;
			return;
		}
		installing = inst._zod;
		Object.defineProperty(proto, key, {
			configurable: true,
			get() {
				Object.defineProperty(this, key, breaker);
				const outer = broke;
				broke = false;
				try {
					const value = compute(this);
					if (broke) delete this[key];
					else Object.defineProperty(this, key, {
						configurable: true,
						writable: true,
						value
					});
					broke = broke || outer;
					return value;
				} catch (err) {
					delete this[key];
					broke = broke || outer;
					throw err;
				}
			},
			set(value) {
				Object.defineProperty(this, key, {
					configurable: true,
					writable: true,
					value
				});
			}
		});
	}
	/**
	* Installs `key` on `inst`'s prototype, computed by `make` on first read and cached there as an own
	* data property. One accessor per constructor rather than one per instance, because an own accessor
	* puts every instance after the first into v8 dictionary mode. The key doubles as the sentinel.
	*/
	function installLazyProp(inst, key, make, enumerable) {
		const proto = claim(inst, key);
		if (!proto) return;
		Object.defineProperty(proto, key, {
			configurable: true,
			get() {
				const desc = {
					configurable: true,
					writable: true,
					enumerable,
					value: void 0
				};
				Object.defineProperty(this, key, desc);
				desc.value = make(this);
				Object.defineProperty(this, key, desc);
				return desc.value;
			},
			set(value) {
				Object.defineProperty(this, key, {
					configurable: true,
					writable: true,
					enumerable,
					value
				});
			}
		});
	}
	/** Marks the thunk `_catch` synthesises for a constant catch value. `Function.length` cannot tell that thunk from a user callback — rest and defaulted parameters both report arity 0 — and a user callback reads `ctx.error`, whose issues only finalize correctly against the caller's per-parse error map. Provenance can say what arity cannot. A plain string key rather than `Symbol.for`, whose call at module scope no bundler can prove pure — the same shape that anchored `urlCanParse` into every build. */
	var CONSTANT_CATCH = "~constantCatch";
	/** Wraps a constant catch value in a thunk tagged with {@link CONSTANT_CATCH}. */
	function constantCatch(value) {
		const fn = () => value;
		fn[CONSTANT_CATCH] = true;
		return fn;
	}
	// node_modules/zod/v4/core/core.js
	var _a$__zod_globalConfig;
	var _a$1;
	var _zodDesc = {
		value: void 0,
		enumerable: false
	};
	var _E = "captureStackTrace" in Error ? Error : null;
	function newError(Definition) {
		const E = _E;
		if (E) {
			const saved = E.stackTraceLimit;
			if (typeof saved === "number") {
				try {
					E.stackTraceLimit = 0;
				} catch (_unused) {
					_E = null;
					return new Definition();
				}
				try {
					return new Definition();
				} finally {
					E.stackTraceLimit = saved;
				}
			}
		}
		return new Definition();
	}
	/* @__NO_SIDE_EFFECTS__ */
	function $constructor(name, initializer, proto, params) {
		var _params$Parent;
		const zodProto = {};
		function Internals(def) {
			this.def = def;
			this.constr = _;
			this.traits = /* @__PURE__ */ new Set();
		}
		Internals.prototype = zodProto;
		const protoMembers = proto;
		const initialized = protoMembers && /* @__PURE__ */ new WeakSet();
		function init(inst, def) {
			if (!inst._zod) {
				_zodDesc.value = new Internals(def);
				try {
					Object.defineProperty(inst, "_zod", _zodDesc);
				} finally {
					_zodDesc.value = void 0;
				}
			} else if (inst._zod.traits.has(name)) return;
			inst._zod.traits.add(name);
			initializer(inst, def);
			if (initialized) {
				var _up;
				const own = Object.getPrototypeOf(inst);
				const ctorProto = inst._zod.constr.prototype;
				let up = own;
				while (up && up !== ctorProto) up = Object.getPrototypeOf(up);
				const target = (_up = up) !== null && _up !== void 0 ? _up : own;
				if (!initialized.has(target)) {
					initialized.add(target);
					members(target, protoMembers);
				}
			}
			const proto = _.prototype;
			for (const k in proto) {
				if (!Object.prototype.hasOwnProperty.call(proto, k)) continue;
				if (!(k in inst)) inst[k] = proto[k].bind(inst);
			}
		}
		const Parent = (_params$Parent = params === null || params === void 0 ? void 0 : params.Parent) !== null && _params$Parent !== void 0 ? _params$Parent : Object;
		class Definition extends Parent {}
		Object.defineProperty(Definition, "name", { value: name });
		function _(def) {
			var _globalThis$__zod_glo;
			const inst = (params === null || params === void 0 ? void 0 : params.Parent) ? newError(Definition) : this;
			init(inst, def);
			const deferred = inst._zod.deferred;
			if (deferred) {
				for (const fn of deferred) fn();
				inst._zod.deferred = void 0;
			}
			const pp = (_globalThis$__zod_glo = globalThis.__zod_globalConfig) === null || _globalThis$__zod_glo === void 0 ? void 0 : _globalThis$__zod_glo.postProcessor;
			if (pp) pp(inst);
			return inst;
		}
		Object.defineProperty(_, "init", { value: init });
		Object.defineProperty(_, Symbol.hasInstance, { value: (inst) => {
			var _inst$_zod;
			if ((params === null || params === void 0 ? void 0 : params.Parent) && inst instanceof params.Parent) return true;
			return inst === null || inst === void 0 || (_inst$_zod = inst._zod) === null || _inst$_zod === void 0 || (_inst$_zod = _inst$_zod.traits) === null || _inst$_zod === void 0 ? void 0 : _inst$_zod.has(name);
		} });
		Object.defineProperty(_, "name", { value: name });
		return _;
	}
	var $ZodAsyncError = class extends Error {
		constructor() {
			super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
		}
	};
	var $ZodEncodeError = class extends Error {
		constructor(name) {
			super(`Encountered unidirectional transform during encode: ${name}`);
			this.name = "ZodEncodeError";
		}
	};
	(_a$__zod_globalConfig = (_a$1 = globalThis).__zod_globalConfig) !== null && _a$__zod_globalConfig !== void 0 || (_a$1.__zod_globalConfig = {});
	var globalConfig = globalThis.__zod_globalConfig;
	function config(newConfig) {
		if (newConfig) Object.assign(globalConfig, newConfig);
		return globalConfig;
	}
	// node_modules/zod/v4/core/errors.js
	function _getMessage() {
		var _internals$message;
		const internals = this._zod;
		(_internals$message = internals.message) !== null && _internals$message !== void 0 || (internals.message = JSON.stringify(internals.def, jsonStringifyReplacer, 2));
		return internals.message;
	}
	function _setMessage(value) {
		this._zod.message = value;
	}
	var _messageDesc = {
		get: _getMessage,
		set: _setMessage,
		enumerable: true,
		configurable: true
	};
	var _issuesDesc = {
		value: void 0,
		enumerable: false
	};
	var _installedToString = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
	var initializer$1 = (inst, def) => {
		inst.name = "$ZodError";
		_issuesDesc.value = def;
		Object.defineProperty(inst, "issues", _issuesDesc);
		_issuesDesc.value = void 0;
		Object.defineProperty(inst, "message", _messageDesc);
		const proto = Object.getPrototypeOf(inst);
		if (!_installedToString.has(proto)) {
			_installedToString.add(proto);
			Object.defineProperty(proto, "toString", {
				configurable: true,
				enumerable: false,
				get() {
					const value = () => this.message;
					Object.defineProperty(this, "toString", {
						value,
						configurable: true,
						writable: true
					});
					return value;
				},
				set(value) {
					Object.defineProperty(this, "toString", {
						value,
						configurable: true,
						writable: true
					});
				}
			});
		}
	};
	var $ZodError = /* @__PURE__ */ $constructor("$ZodError", initializer$1);
	/** Get-or-create `obj[key]` as an own data property. A path segment naming an inherited member
	* ("toString", "constructor") would otherwise read through to the prototype, and assigning
	* "__proto__" would hit the setter instead of creating a key. */
	function node(obj, key, make) {
		if (!Object.prototype.hasOwnProperty.call(obj, key)) {
			if (key === "__proto__") Object.defineProperty(obj, key, {
				value: make(),
				writable: true,
				enumerable: true,
				configurable: true
			});
			else obj[key] = make();
		}
		return obj[key];
	}
	function flattenError(error, mapper = (issue) => issue.message) {
		const fieldErrors = {};
		const formErrors = [];
		for (const sub of error.issues) if (sub.path.length > 0) node(fieldErrors, sub.path[0], () => []).push(mapper(sub));
		else formErrors.push(mapper(sub));
		return {
			formErrors,
			fieldErrors
		};
	}
	function formatError(error, mapper = (issue) => issue.message) {
		const fieldErrors = { _errors: [] };
		const processError = (error, path = []) => {
			for (const issue of error.issues) if (issue.code === "invalid_union" && issue.errors.length) issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
			else if (issue.code === "invalid_key") processError({ issues: issue.issues }, [...path, ...issue.path]);
			else if (issue.code === "invalid_element") processError({ issues: issue.issues }, [...path, ...issue.path]);
			else {
				const fullpath = [...path, ...issue.path];
				if (fullpath.length === 0) fieldErrors._errors.push(mapper(issue));
				else {
					let curr = fieldErrors;
					let i = 0;
					while (i < fullpath.length) {
						const el = fullpath[i];
						const terminal = i === fullpath.length - 1;
						if (el === "_errors") {
							if (terminal) curr._errors.push(mapper(issue));
							i++;
							continue;
						}
						if (!Object.prototype.hasOwnProperty.call(curr, el)) Object.defineProperty(curr, el, {
							value: { _errors: [] },
							enumerable: true,
							writable: true,
							configurable: true
						});
						const node = curr[el];
						if (terminal) node._errors.push(mapper(issue));
						curr = node;
						i++;
					}
				}
			}
		};
		processError(error);
		return fieldErrors;
	}
	// node_modules/zod/v4/core/parse.js
	function finalizeParams(callee, params) {
		var _params$callee;
		return {
			callee: (_params$callee = params === null || params === void 0 ? void 0 : params.callee) !== null && _params$callee !== void 0 ? _params$callee : callee,
			Err: params === null || params === void 0 ? void 0 : params.Err
		};
	}
	var _parse = (_Err) => {
		const fn = (schema, value, _ctx, _params) => {
			const ctx = _ctx ? _objectSpread2(_objectSpread2({}, _ctx), {}, { async: false }) : { async: false };
			const result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) throw new $ZodAsyncError();
			if (result.issues.length) {
				var _params$Err, _params$callee2;
				const e = new ((_params$Err = _params === null || _params === void 0 ? void 0 : _params.Err) !== null && _params$Err !== void 0 ? _params$Err : _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
				captureStackTrace(e, (_params$callee2 = _params === null || _params === void 0 ? void 0 : _params.callee) !== null && _params$callee2 !== void 0 ? _params$callee2 : fn);
				throw e;
			}
			return result.value;
		};
		return fn;
	};
	var _parseAsync = (_Err) => {
		const fn = async (schema, value, _ctx, params) => {
			const ctx = _ctx ? _objectSpread2(_objectSpread2({}, _ctx), {}, { async: true }) : { async: true };
			let result = schema._zod.run({
				value,
				issues: []
			}, ctx);
			if (result instanceof Promise) result = await result;
			if (result.issues.length) {
				var _params$Err2, _params$callee3;
				const e = new ((_params$Err2 = params === null || params === void 0 ? void 0 : params.Err) !== null && _params$Err2 !== void 0 ? _params$Err2 : _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
				captureStackTrace(e, (_params$callee3 = params === null || params === void 0 ? void 0 : params.callee) !== null && _params$callee3 !== void 0 ? _params$callee3 : fn);
				throw e;
			}
			return result.value;
		};
		return fn;
	};
	var _safeParse = (_Err) => (schema, value, _ctx) => {
		const ctx = _ctx ? _objectSpread2(_objectSpread2({}, _ctx), {}, { async: false }) : { async: false };
		const result = schema._zod.run({
			value,
			issues: []
		}, ctx);
		if (result instanceof Promise) throw new $ZodAsyncError();
		return result.issues.length ? failure(_Err, result.issues, ctx) : {
			success: true,
			data: result.value
		};
	};
	function failure(Err, issues, ctx) {
		let error;
		return {
			success: false,
			get error() {
				if (!error) {
					error = new Err(issues.map((iss) => finalizeIssue(iss, ctx, config())));
					issues = void 0;
					ctx = void 0;
				}
				return error;
			},
			set error(e) {
				error = e;
				issues = void 0;
				ctx = void 0;
			}
		};
	}
	var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
		const ctx = _ctx ? _objectSpread2(_objectSpread2({}, _ctx), {}, { async: true }) : { async: true };
		let result = schema._zod.run({
			value,
			issues: []
		}, ctx);
		if (result instanceof Promise) result = await result;
		return result.issues.length ? failure(_Err, result.issues, ctx) : {
			success: true,
			data: result.value
		};
	};
	var COMPILE_INVALID = /* @__PURE__ */ Symbol.for("zod.compile.invalid");
	var COMPILE_FALLBACK = /* @__PURE__ */ Symbol.for("zod.compile.fallback");
	var validate = ((schema, value, _ctx) => {
		const validator = schema._zod.bag.validator;
		if (validator !== void 0) {
			if (validator(value) !== COMPILE_INVALID) return true;
			if (validator.definite === true && _ctx === void 0) return false;
		}
		return validateFallback(schema, value, _ctx);
	});
	function validateFallback(schema, value, _ctx) {
		const ctx = _ctx ? _objectSpread2(_objectSpread2({}, _ctx), {}, {
			async: false,
			abortEarly: true
		}) : {
			async: false,
			abortEarly: true
		};
		const fallbackRun = schema._zod.bag.fallbackRun;
		let result;
		if (fallbackRun) {
			ctx[COMPILE_FALLBACK] = true;
			result = fallbackRun({
				value,
				issues: []
			}, ctx);
		} else result = schema._zod.run({
			value,
			issues: []
		}, ctx);
		if (result instanceof Promise) throw new $ZodAsyncError();
		return result.issues.length === 0;
	}
	var validateAsync$1 = async (schema, value, _ctx) => {
		const ctx = _ctx ? _objectSpread2(_objectSpread2({}, _ctx), {}, {
			async: true,
			abortEarly: true
		}) : {
			async: true,
			abortEarly: true
		};
		let result = schema._zod.run({
			value,
			issues: []
		}, ctx);
		if (result instanceof Promise) result = await result;
		return result.issues.length === 0;
	};
	var _encode = (_Err) => {
		const parse = _parse(_Err);
		const fn = (schema, value, _ctx, _params) => {
			const ctx = _ctx ? _objectSpread2(_objectSpread2({}, _ctx), {}, { direction: "backward" }) : { direction: "backward" };
			return parse(schema, value, ctx, finalizeParams(fn, _params));
		};
		return fn;
	};
	var _decode = (_Err) => {
		const parse = _parse(_Err);
		const fn = (schema, value, _ctx, _params) => {
			return parse(schema, value, _ctx, finalizeParams(fn, _params));
		};
		return fn;
	};
	var _encodeAsync = (_Err) => {
		const parseAsync = _parseAsync(_Err);
		const fn = async (schema, value, _ctx, _params) => {
			const ctx = _ctx ? _objectSpread2(_objectSpread2({}, _ctx), {}, { direction: "backward" }) : { direction: "backward" };
			return await parseAsync(schema, value, ctx, finalizeParams(fn, _params));
		};
		return fn;
	};
	var _decodeAsync = (_Err) => {
		const parseAsync = _parseAsync(_Err);
		const fn = async (schema, value, _ctx, _params) => {
			return await parseAsync(schema, value, _ctx, finalizeParams(fn, _params));
		};
		return fn;
	};
	var _safeEncode = (_Err) => (schema, value, _ctx) => {
		const ctx = _ctx ? _objectSpread2(_objectSpread2({}, _ctx), {}, { direction: "backward" }) : { direction: "backward" };
		return _safeParse(_Err)(schema, value, ctx);
	};
	var _safeDecode = (_Err) => (schema, value, _ctx) => {
		return _safeParse(_Err)(schema, value, _ctx);
	};
	var _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
		const ctx = _ctx ? _objectSpread2(_objectSpread2({}, _ctx), {}, { direction: "backward" }) : { direction: "backward" };
		return _safeParseAsync(_Err)(schema, value, ctx);
	};
	var _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
		return _safeParseAsync(_Err)(schema, value, _ctx);
	};
	// node_modules/zod/v4/core/regexes.js
	/**
	* @deprecated CUID v1 is deprecated by its authors due to information leakage
	* (timestamps embedded in the id). Use {@link cuid2} instead.
	* See https://github.com/paralleldrive/cuid.
	*/
	var cuid = /^[cC][0-9a-z]{6,}$/;
	var cuid2 = /^[0-9a-z]+$/;
	var ulid = /^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$/;
	var xid = /^[0-9a-vA-V]{20}$/;
	var ksuid = /^[A-Za-z0-9]{27}$/;
	var nanoid = /^[a-zA-Z0-9_-]{21}$/;
	function nanoidOfLength(length) {
		return new RegExp(`^[a-zA-Z0-9_-]{${length}}$`);
	}
	/** ISO 8601-1 duration regex. Does not support the 8601-2 extensions like negative durations or fractional/negative components. */
	var duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
	/** A regex for any UUID-like identifier: 8-4-4-4-12 hex pattern */
	var guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
	/** Returns a regex for validating an RFC 9562/4122 UUID.
	*
	* @param version Optionally specify a version 1-8. If no version is specified, all versions are supported. */
	var uuid = (version) => {
		if (!version) return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
		return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
	};
	/** Practical email validation */
	var email = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
	var _emoji$1 = `^(?=[\\s\\S]*[\\p{Extended_Pictographic}\\p{Regional_Indicator}\\u20E3])[\\p{Extended_Pictographic}\\p{Emoji_Component}]+$`;
	function emoji() {
		return new RegExp(_emoji$1, "u");
	}
	var ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
	var ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
	var cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
	var cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
	var base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
	var base64url = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2,3})?$/;
	var httpProtocol = /^https?$/;
	var e164 = /^\+[1-9]\d{6,14}$/;
	var dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
	/** Anchors a pattern source. The interpolation lives here rather than at the call site because
	* esbuild will not drop a `@__PURE__` call whose own argument interpolates a variable, but it
	* will drop `anchor(dateSource)`. Keeping it inline pinned `date` into every bundle. */
	function anchor(source) {
		return new RegExp(`^${source}$`);
	}
	var date = /*@__PURE__*/ anchor(dateSource);
	function timeSource(args) {
		const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
		return typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : args.seconds ? `${hhmm}:[0-5]\\d(?:\\.\\d+)?` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
	}
	function time(args) {
		return new RegExp(`^${timeSource(args)}$`);
	}
	function datetime(args) {
		const opts = ["Z"];
		if (args.offset) opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
		const qualified = `${timeSource({
			precision: args.precision,
			seconds: true
		})}(?:${opts.join("|")})`;
		const timeRegex = args.local ? `${qualified}|${timeSource({ precision: args.precision })}` : qualified;
		return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
	}
	var anyString = /^[\s\S]{0,}$/;
	var integer = /^-?\d+$/;
	var number$1 = /^-?\d+(?:\.\d+)?$/;
	var boolean$1 = /^(?:true|false)$/i;
	var lowercase = /^[^A-Z]*$/;
	var uppercase = /^[^a-z]*$/;
	// node_modules/zod/v4/core/checks.js
	var $ZodCheck = /*@__PURE__*/ $constructor("$ZodCheck", (inst, def) => {
		var _inst$_zod, _a$onattach;
		var _a;
		(_inst$_zod = inst._zod) !== null && _inst$_zod !== void 0 || (inst._zod = {});
		inst._zod.def = def;
		(_a$onattach = (_a = inst._zod).onattach) !== null && _a$onattach !== void 0 || (_a.onattach = []);
	});
	/** Default `when` for length-based checks: run only on non-nullish values with a `length`. */
	var _whenHasLength = (payload) => {
		const val = payload.value;
		return !nullish(val) && val.length !== void 0;
	};
	var numericOriginMap = {
		number: "number",
		bigint: "bigint",
		object: "date"
	};
	var $ZodCheckLessThan = /*@__PURE__*/ $constructor("$ZodCheckLessThan", (inst, def) => {
		$ZodCheck.init(inst, def);
		const origin = numericOriginMap[typeof def.value];
		inst._zod.check = (payload) => {
			var _numericOriginMap$pay;
			if (def.inclusive ? payload.value <= def.value : payload.value < def.value) return;
			payload.issues.push({
				origin: (_numericOriginMap$pay = numericOriginMap[typeof payload.value]) !== null && _numericOriginMap$pay !== void 0 ? _numericOriginMap$pay : origin,
				code: "too_big",
				maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
				input: payload.value,
				inclusive: def.inclusive,
				inst,
				continue: !def.abort
			});
		};
	});
	var $ZodCheckGreaterThan = /*@__PURE__*/ $constructor("$ZodCheckGreaterThan", (inst, def) => {
		$ZodCheck.init(inst, def);
		const origin = numericOriginMap[typeof def.value];
		inst._zod.check = (payload) => {
			var _numericOriginMap$pay2;
			if (def.inclusive ? payload.value >= def.value : payload.value > def.value) return;
			payload.issues.push({
				origin: (_numericOriginMap$pay2 = numericOriginMap[typeof payload.value]) !== null && _numericOriginMap$pay2 !== void 0 ? _numericOriginMap$pay2 : origin,
				code: "too_small",
				minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
				input: payload.value,
				inclusive: def.inclusive,
				inst,
				continue: !def.abort
			});
		};
	});
	var $ZodCheckMultipleOf = /*@__PURE__*/ $constructor("$ZodCheckMultipleOf", (inst, def) => {
		$ZodCheck.init(inst, def);
		inst._zod.check = (payload) => {
			if (typeof payload.value !== typeof def.value) throw new Error("Cannot mix number and bigint in multiple_of check.");
			if (typeof payload.value === "bigint" ? def.value !== BigInt(0) && payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0) return;
			payload.issues.push({
				origin: typeof payload.value,
				code: "not_multiple_of",
				divisor: def.value,
				input: payload.value,
				inst,
				continue: !def.abort
			});
		};
	});
	var $ZodCheckNumberFormat = /*@__PURE__*/ $constructor("$ZodCheckNumberFormat", (inst, def) => {
		var _def$format;
		$ZodCheck.init(inst, def);
		def.format = def.format || "float64";
		const isInt = (_def$format = def.format) === null || _def$format === void 0 ? void 0 : _def$format.includes("int");
		const origin = isInt ? "int" : "number";
		const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
		inst._zod.check = (payload) => {
			const input = payload.value;
			if (isInt) {
				if (!Number.isInteger(input)) {
					payload.issues.push({
						expected: origin,
						format: def.format,
						code: "invalid_type",
						continue: false,
						input,
						inst
					});
					return;
				}
				if (!Number.isSafeInteger(input)) {
					if (input > 0) payload.issues.push({
						input,
						code: "too_big",
						maximum: Number.MAX_SAFE_INTEGER,
						note: "Integers must be within the safe integer range.",
						inst,
						origin,
						inclusive: true,
						continue: !def.abort
					});
					else payload.issues.push({
						input,
						code: "too_small",
						minimum: Number.MIN_SAFE_INTEGER,
						note: "Integers must be within the safe integer range.",
						inst,
						origin,
						inclusive: true,
						continue: !def.abort
					});
					return;
				}
			}
			if (input < minimum) payload.issues.push({
				origin: "number",
				input,
				code: "too_small",
				minimum,
				inclusive: true,
				inst,
				continue: !def.abort
			});
			if (input > maximum) payload.issues.push({
				origin: "number",
				input,
				code: "too_big",
				maximum,
				inclusive: true,
				inst,
				continue: !def.abort
			});
		};
	});
	var $ZodCheckMaxLength = /*@__PURE__*/ $constructor("$ZodCheckMaxLength", (inst, def) => {
		var _a$when4;
		var _a;
		$ZodCheck.init(inst, def);
		(_a$when4 = (_a = inst._zod.def).when) !== null && _a$when4 !== void 0 || (_a.when = _whenHasLength);
		inst._zod.check = (payload) => {
			const input = payload.value;
			const units = input.length;
			if ((typeof input === "string" && units > def.maximum ? codePointLength(input) : units) <= def.maximum) return;
			const origin = getLengthableOrigin(input);
			payload.issues.push({
				origin,
				code: "too_big",
				maximum: def.maximum,
				inclusive: true,
				input,
				inst,
				continue: !def.abort
			});
		};
	});
	var $ZodCheckMinLength = /*@__PURE__*/ $constructor("$ZodCheckMinLength", (inst, def) => {
		var _a$when5;
		var _a;
		$ZodCheck.init(inst, def);
		(_a$when5 = (_a = inst._zod.def).when) !== null && _a$when5 !== void 0 || (_a.when = _whenHasLength);
		inst._zod.check = (payload) => {
			const input = payload.value;
			const units = input.length;
			if ((typeof input === "string" && units >= def.minimum && units < def.minimum * 2 ? codePointLength(input) : units) >= def.minimum) return;
			const origin = getLengthableOrigin(input);
			payload.issues.push({
				origin,
				code: "too_small",
				minimum: def.minimum,
				inclusive: true,
				input,
				inst,
				continue: !def.abort
			});
		};
	});
	var $ZodCheckLengthEquals = /*@__PURE__*/ $constructor("$ZodCheckLengthEquals", (inst, def) => {
		var _a$when6;
		var _a;
		$ZodCheck.init(inst, def);
		(_a$when6 = (_a = inst._zod.def).when) !== null && _a$when6 !== void 0 || (_a.when = _whenHasLength);
		inst._zod.check = (payload) => {
			const input = payload.value;
			const units = input.length;
			const length = typeof input === "string" && units >= def.length && units <= def.length * 2 ? codePointLength(input) : units;
			if (length === def.length) return;
			const origin = getLengthableOrigin(input);
			const tooBig = length > def.length;
			payload.issues.push(_objectSpread2(_objectSpread2({ origin }, tooBig ? {
				code: "too_big",
				maximum: def.length
			} : {
				code: "too_small",
				minimum: def.length
			}), {}, {
				inclusive: true,
				exact: true,
				input: payload.value,
				inst,
				continue: !def.abort
			}));
		};
	});
	var $ZodCheckStringFormat = /*@__PURE__*/ $constructor("$ZodCheckStringFormat", (inst, def) => {
		var _a$check, _b$check;
		var _a, _b;
		$ZodCheck.init(inst, def);
		if (def.pattern) (_a$check = (_a = inst._zod).check) !== null && _a$check !== void 0 || (_a.check = (payload) => {
			def.pattern.lastIndex = 0;
			if (def.pattern.test(payload.value)) return;
			payload.issues.push(_objectSpread2(_objectSpread2({
				origin: "string",
				code: "invalid_format",
				format: def.format,
				input: payload.value
			}, def.pattern ? { pattern: def.pattern.toString() } : {}), {}, {
				inst,
				continue: !def.abort
			}));
		});
		else (_b$check = (_b = inst._zod).check) !== null && _b$check !== void 0 || (_b.check = () => {});
	});
	var $ZodCheckRegex = /*@__PURE__*/ $constructor("$ZodCheckRegex", (inst, def) => {
		$ZodCheckStringFormat.init(inst, def);
		inst._zod.check = (payload) => {
			def.pattern.lastIndex = 0;
			if (def.pattern.test(payload.value)) return;
			payload.issues.push({
				origin: "string",
				code: "invalid_format",
				format: "regex",
				input: payload.value,
				pattern: def.pattern.toString(),
				inst,
				continue: !def.abort
			});
		};
	});
	var $ZodCheckLowerCase = /*@__PURE__*/ $constructor("$ZodCheckLowerCase", (inst, def) => {
		var _def$pattern;
		(_def$pattern = def.pattern) !== null && _def$pattern !== void 0 || (def.pattern = lowercase);
		$ZodCheckStringFormat.init(inst, def);
	});
	var $ZodCheckUpperCase = /*@__PURE__*/ $constructor("$ZodCheckUpperCase", (inst, def) => {
		var _def$pattern2;
		(_def$pattern2 = def.pattern) !== null && _def$pattern2 !== void 0 || (def.pattern = uppercase);
		$ZodCheckStringFormat.init(inst, def);
	});
	var $ZodCheckIncludes = /*@__PURE__*/ $constructor("$ZodCheckIncludes", (inst, def) => {
		$ZodCheck.init(inst, def);
		const escapedRegex = escapeRegex(def.includes);
		def.pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position},}${escapedRegex}` : escapedRegex);
		inst._zod.check = (payload) => {
			if (payload.value.includes(def.includes, def.position)) return;
			payload.issues.push({
				origin: "string",
				code: "invalid_format",
				format: "includes",
				includes: def.includes,
				input: payload.value,
				inst,
				continue: !def.abort
			});
		};
	});
	var $ZodCheckStartsWith = /*@__PURE__*/ $constructor("$ZodCheckStartsWith", (inst, def) => {
		var _def$pattern3;
		$ZodCheck.init(inst, def);
		const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
		(_def$pattern3 = def.pattern) !== null && _def$pattern3 !== void 0 || (def.pattern = pattern);
		inst._zod.check = (payload) => {
			if (payload.value.startsWith(def.prefix)) return;
			payload.issues.push({
				origin: "string",
				code: "invalid_format",
				format: "starts_with",
				prefix: def.prefix,
				input: payload.value,
				inst,
				continue: !def.abort
			});
		};
	});
	var $ZodCheckEndsWith = /*@__PURE__*/ $constructor("$ZodCheckEndsWith", (inst, def) => {
		var _def$pattern4;
		$ZodCheck.init(inst, def);
		const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
		(_def$pattern4 = def.pattern) !== null && _def$pattern4 !== void 0 || (def.pattern = pattern);
		inst._zod.check = (payload) => {
			if (payload.value.endsWith(def.suffix)) return;
			payload.issues.push({
				origin: "string",
				code: "invalid_format",
				format: "ends_with",
				suffix: def.suffix,
				input: payload.value,
				inst,
				continue: !def.abort
			});
		};
	});
	var $ZodCheckOverwrite = /*@__PURE__*/ $constructor("$ZodCheckOverwrite", (inst, def) => {
		$ZodCheck.init(inst, def);
		inst._zod.check = (payload) => {
			payload.value = def.tx(payload.value);
		};
	});
	// node_modules/zod/v4/core/doc.js
	var Doc = class {
		constructor(args = [], closed = {}) {
			this.content = [];
			this.indent = 0;
			this.args = args;
			this.closed = closed;
		}
		indented(fn) {
			this.indent += 1;
			try {
				fn(this);
			} finally {
				this.indent -= 1;
			}
		}
		write(arg) {
			if (typeof arg === "function") {
				arg(this, { execution: "sync" });
				arg(this, { execution: "async" });
				return;
			}
			const lines = arg.split("\n").filter((x) => x);
			const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
			const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
			for (const line of dedented) this.content.push(line);
		}
		compile() {
			var _this$content, _this;
			const F = Function;
			const content = (_this$content = (_this = this) === null || _this === void 0 ? void 0 : _this.content) !== null && _this$content !== void 0 ? _this$content : [``];
			return new F(...Object.keys(this.closed), `return function (${this.args.join(", ")}) {\n${content.join("\n")}\n};`)(...Object.values(this.closed));
		}
	};
	// node_modules/zod/v4/core/versions.js
	var version = {
		major: 4,
		minor: 6,
		patch: 7
	};
	// node_modules/zod/v4/core/schemas.js
	var $ZodType = /*@__PURE__*/ $constructor("$ZodType", (inst, def) => {
		var _inst;
		var _a;
		(_inst = inst) !== null && _inst !== void 0 || (inst = {});
		inst._zod.def = def;
		inst._zod.bag = inst._zod.bag || {};
		inst._zod.version = version;
		const defChecks = inst._zod.def.checks;
		const checks = inst._zod.traits.has("$ZodCheck") ? [inst, ...defChecks !== null && defChecks !== void 0 ? defChecks : []] : (defChecks === null || defChecks === void 0 ? void 0 : defChecks.length) ? [...defChecks] : [];
		for (const ch of checks) for (const fn of ch._zod.onattach) fn(inst);
		if (checks.length === 0) {
			var _a$deferred, _inst$_zod$deferred;
			(_a$deferred = (_a = inst._zod).deferred) !== null && _a$deferred !== void 0 || (_a.deferred = []);
			(_inst$_zod$deferred = inst._zod.deferred) === null || _inst$_zod$deferred === void 0 || _inst$_zod$deferred.push(() => {
				inst._zod.run = inst._zod.parse;
			});
		} else {
			const runChecks = (payload, checks, ctx) => {
				if (payload.memo) return payload;
				let isAborted = aborted(payload);
				let asyncResult;
				for (const ch of checks) {
					if (ch._zod.def.when) {
						if (explicitlyAborted(payload)) continue;
						if (!ch._zod.def.when(payload)) continue;
					} else if (isAborted) continue;
					const currLen = payload.issues.length;
					const _ = ch._zod.check(payload);
					if (_ instanceof Promise && (ctx === null || ctx === void 0 ? void 0 : ctx.async) === false) throw new $ZodAsyncError();
					if (asyncResult || _ instanceof Promise) {
						var _asyncResult;
						asyncResult = ((_asyncResult = asyncResult) !== null && _asyncResult !== void 0 ? _asyncResult : Promise.resolve()).then(async () => {
							await _;
							if (payload.issues.length === currLen) return;
							attachSchema(payload.issues, currLen, inst);
							if (!isAborted) isAborted = aborted(payload, currLen);
						});
					} else {
						if (payload.issues.length === currLen) continue;
						attachSchema(payload.issues, currLen, inst);
						if (!isAborted) isAborted = aborted(payload, currLen);
					}
				}
				if (asyncResult) return asyncResult.then(() => {
					return payload;
				});
				return payload;
			};
			const handleCanaryResult = (canary, payload, ctx) => {
				if (aborted(canary)) {
					canary.aborted = true;
					return canary;
				}
				const checkResult = runChecks(payload, checks, ctx);
				if (checkResult instanceof Promise) {
					if (ctx.async === false) throw new $ZodAsyncError();
					return checkResult.then((checkResult) => inst._zod.parse(checkResult, ctx));
				}
				return inst._zod.parse(checkResult, ctx);
			};
			inst._zod.run = (payload, ctx) => {
				if (ctx.skipChecks) return inst._zod.parse(payload, ctx);
				if (ctx.direction === "backward") {
					const canary = inst._zod.parse({
						value: payload.value,
						issues: []
					}, _objectSpread2(_objectSpread2({}, ctx), {}, { skipChecks: true }));
					if (canary instanceof Promise) return canary.then((canary) => {
						return handleCanaryResult(canary, payload, ctx);
					});
					return handleCanaryResult(canary, payload, ctx);
				}
				const result = inst._zod.parse(payload, ctx);
				if (result instanceof Promise) {
					if (ctx.async === false) throw new $ZodAsyncError();
					return result.then((result) => runChecks(result, checks, ctx));
				}
				return runChecks(result, checks, ctx);
			};
		}
	}, {
		get "~standard"() {
			return hide(this, "~standard", standardProps(this));
		},
		set "~standard"(value) {
			own(this, "~standard", value);
		}
	});
	/** The Standard Schema surface for `inst`. Shared so wrappers can extend it without forcing it. */
	var toStandardResult = (r, ctx) => r.issues.length ? { issues: r.issues.map((iss) => finalizeIssue(iss, ctx, config())) } : { value: r.value };
	async function validateAsync(inst, value) {
		const ctx = { async: true };
		return toStandardResult(await inst._zod.run({
			value,
			issues: []
		}, ctx), ctx);
	}
	function standardProps(inst) {
		return {
			validate: (value) => {
				const ctx = { async: false };
				try {
					const r = inst._zod.run({
						value,
						issues: []
					}, ctx);
					if (!(r instanceof Promise)) return toStandardResult(r, ctx);
				} catch (_) {}
				return validateAsync(inst, value);
			},
			vendor: "zod",
			version: 1
		};
	}
	var $ZodString = /*@__PURE__*/ $constructor("$ZodString", (inst, def) => {
		var _def$pattern;
		$ZodType.init(inst, def);
		inst._zod.pattern = (_def$pattern = def.pattern) !== null && _def$pattern !== void 0 ? _def$pattern : anyString;
		inst._zod.parse = (payload, _) => {
			if (def.coerce) try {
				payload.value = String(payload.value);
			} catch (_) {}
			if (typeof payload.value === "string") return payload;
			payload.issues.push({
				expected: "string",
				code: "invalid_type",
				input: payload.value,
				inst
			});
			return payload;
		};
	});
	var $ZodStringFormat = /*@__PURE__*/ $constructor("$ZodStringFormat", (inst, def) => {
		$ZodCheckStringFormat.init(inst, def);
		$ZodString.init(inst, def);
	});
	var $ZodGUID = /*@__PURE__*/ $constructor("$ZodGUID", (inst, def) => {
		var _def$pattern2;
		(_def$pattern2 = def.pattern) !== null && _def$pattern2 !== void 0 || (def.pattern = guid);
		$ZodStringFormat.init(inst, def);
	});
	var $ZodUUID = /*@__PURE__*/ $constructor("$ZodUUID", (inst, def) => {
		var _def$pattern4;
		if (def.version) {
			var _def$pattern3;
			const v = {
				v1: 1,
				v2: 2,
				v3: 3,
				v4: 4,
				v5: 5,
				v6: 6,
				v7: 7,
				v8: 8
			}[def.version];
			if (v === void 0) throw new Error(`Invalid UUID version: "${def.version}"`);
			(_def$pattern3 = def.pattern) !== null && _def$pattern3 !== void 0 || (def.pattern = uuid(v));
		} else (_def$pattern4 = def.pattern) !== null && _def$pattern4 !== void 0 || (def.pattern = uuid());
		$ZodStringFormat.init(inst, def);
	});
	var $ZodEmail = /*@__PURE__*/ $constructor("$ZodEmail", (inst, def) => {
		var _def$pattern5;
		(_def$pattern5 = def.pattern) !== null && _def$pattern5 !== void 0 || (def.pattern = email);
		$ZodStringFormat.init(inst, def);
	});
	function canParseURL(input) {
		try {
			if (typeof URL !== "undefined" && typeof URL.canParse === "function") return URL.canParse(input);
			new URL(input);
			return true;
		} catch (_unused) {
			return false;
		}
	}
	function validateURL(trimmed, def) {
		if (!("normalize" in def) && !("hostname" in def) && !("protocol" in def)) return canParseURL(trimmed) || 2;
		return parseURLObject(trimmed, def);
	}
	/** Parses a URL while preserving the non-normalizing HTTP guard. */
	function parseURLObject(trimmed, def) {
		var _def$protocol;
		if (!def.normalize && ((_def$protocol = def.protocol) === null || _def$protocol === void 0 ? void 0 : _def$protocol.source) === httpProtocol.source && !/^https?:\/\//i.test(trimmed)) return 1;
		try {
			if (typeof URL !== "undefined") {
				var _URLStatic$parse;
				const URLStatic = URL;
				if (typeof URLStatic.parse === "function") return (_URLStatic$parse = URLStatic.parse(trimmed)) !== null && _URLStatic$parse !== void 0 ? _URLStatic$parse : 2;
			}
			return new URL(trimmed);
		} catch (_unused2) {
			return 2;
		}
	}
	var asciiTabOrNewline = /[\t\n\r]/g;
	/** The URL parser deletes every ASCII tab, LF and CR from its input before it parses, so `new URL("https://exa\nmple.com")` reports on `example.com`. Applying the same deletion to the returned value closes the half of that divergence which can move the host; the parser's other rewrite, stripping C0 controls at the edges, cannot. */
	function stripTabAndNewline(value) {
		return value.replace(asciiTabOrNewline, "");
	}
	function urlHostnameOk(url, hostname) {
		hostname.lastIndex = 0;
		return hostname.test(url.hostname);
	}
	function urlProtocolOk(url, protocol) {
		protocol.lastIndex = 0;
		return protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol);
	}
	var $ZodURL = /*@__PURE__*/ $constructor("$ZodURL", (inst, def) => {
		$ZodStringFormat.init(inst, def);
		inst._zod.check = (payload) => {
			try {
				const trimmed = payload.value.trim();
				const url = validateURL(trimmed, def);
				if (url === 1) {
					payload.issues.push({
						code: "invalid_format",
						format: "url",
						note: "Invalid URL format",
						input: payload.value,
						inst,
						continue: !def.abort
					});
					return;
				}
				if (url === 2) {
					payload.issues.push({
						code: "invalid_format",
						format: "url",
						input: payload.value,
						inst,
						continue: !def.abort
					});
					return;
				}
				if (url === true) {
					payload.value = stripTabAndNewline(trimmed);
					return;
				}
				if (def.hostname && !urlHostnameOk(url, def.hostname)) payload.issues.push({
					code: "invalid_format",
					format: "url",
					note: "Invalid hostname",
					pattern: def.hostname.source,
					input: payload.value,
					inst,
					continue: !def.abort
				});
				if (def.protocol && !urlProtocolOk(url, def.protocol)) payload.issues.push({
					code: "invalid_format",
					format: "url",
					note: "Invalid protocol",
					pattern: def.protocol.source,
					input: payload.value,
					inst,
					continue: !def.abort
				});
				payload.value = def.normalize ? url.href : stripTabAndNewline(trimmed);
				return;
			} catch (_) {
				payload.issues.push({
					code: "invalid_format",
					format: "url",
					input: payload.value,
					inst,
					continue: !def.abort
				});
			}
		};
	});
	var $ZodEmoji = /*@__PURE__*/ $constructor("$ZodEmoji", (inst, def) => {
		var _def$pattern6;
		(_def$pattern6 = def.pattern) !== null && _def$pattern6 !== void 0 || (def.pattern = emoji());
		$ZodStringFormat.init(inst, def);
	});
	var $ZodNanoID = /*@__PURE__*/ $constructor("$ZodNanoID", (inst, def) => {
		var _def$pattern7;
		if (def.length !== void 0 && (!Number.isInteger(def.length) || def.length < 1)) throw new Error(`Invalid nanoid length: ${def.length}`);
		(_def$pattern7 = def.pattern) !== null && _def$pattern7 !== void 0 || (def.pattern = def.length === void 0 ? nanoid : nanoidOfLength(def.length));
		$ZodStringFormat.init(inst, def);
	});
	/**
	* @deprecated CUID v1 is deprecated by its authors due to information leakage
	* (timestamps embedded in the id). Use {@link $ZodCUID2} instead.
	* See https://github.com/paralleldrive/cuid.
	*/
	var $ZodCUID = /*@__PURE__*/ $constructor("$ZodCUID", (inst, def) => {
		var _def$pattern8;
		(_def$pattern8 = def.pattern) !== null && _def$pattern8 !== void 0 || (def.pattern = cuid);
		$ZodStringFormat.init(inst, def);
	});
	var $ZodCUID2 = /*@__PURE__*/ $constructor("$ZodCUID2", (inst, def) => {
		var _def$pattern9;
		(_def$pattern9 = def.pattern) !== null && _def$pattern9 !== void 0 || (def.pattern = cuid2);
		$ZodStringFormat.init(inst, def);
	});
	var $ZodULID = /*@__PURE__*/ $constructor("$ZodULID", (inst, def) => {
		var _def$pattern10;
		(_def$pattern10 = def.pattern) !== null && _def$pattern10 !== void 0 || (def.pattern = ulid);
		$ZodStringFormat.init(inst, def);
	});
	var $ZodXID = /*@__PURE__*/ $constructor("$ZodXID", (inst, def) => {
		var _def$pattern11;
		(_def$pattern11 = def.pattern) !== null && _def$pattern11 !== void 0 || (def.pattern = xid);
		$ZodStringFormat.init(inst, def);
	});
	var $ZodKSUID = /*@__PURE__*/ $constructor("$ZodKSUID", (inst, def) => {
		var _def$pattern12;
		(_def$pattern12 = def.pattern) !== null && _def$pattern12 !== void 0 || (def.pattern = ksuid);
		$ZodStringFormat.init(inst, def);
	});
	var $ZodISODateTime = /*@__PURE__*/ $constructor("$ZodISODateTime", (inst, def) => {
		var _def$pattern13;
		(_def$pattern13 = def.pattern) !== null && _def$pattern13 !== void 0 || (def.pattern = datetime(def));
		$ZodStringFormat.init(inst, def);
	});
	var $ZodISODate = /*@__PURE__*/ $constructor("$ZodISODate", (inst, def) => {
		var _def$pattern14;
		(_def$pattern14 = def.pattern) !== null && _def$pattern14 !== void 0 || (def.pattern = date);
		$ZodStringFormat.init(inst, def);
	});
	var $ZodISOTime = /*@__PURE__*/ $constructor("$ZodISOTime", (inst, def) => {
		var _def$pattern15;
		(_def$pattern15 = def.pattern) !== null && _def$pattern15 !== void 0 || (def.pattern = time(def));
		$ZodStringFormat.init(inst, def);
	});
	var $ZodISODuration = /*@__PURE__*/ $constructor("$ZodISODuration", (inst, def) => {
		var _def$pattern16;
		(_def$pattern16 = def.pattern) !== null && _def$pattern16 !== void 0 || (def.pattern = duration);
		$ZodStringFormat.init(inst, def);
	});
	var $ZodIPv4 = /*@__PURE__*/ $constructor("$ZodIPv4", (inst, def) => {
		var _def$pattern17;
		(_def$pattern17 = def.pattern) !== null && _def$pattern17 !== void 0 || (def.pattern = ipv4);
		$ZodStringFormat.init(inst, def);
	});
	/** An IPv6 address is written with hex digits, colons and dots, and nothing else. The guard is what makes the check below an IPv6 check: `new URL("http://[...]")` parses an authority, not an address, so `@` and `\` re-delimit it and `"::@1\\"` validates against the host `0.0.0.1`. The URL parser also deletes ASCII tab, LF and CR rather than failing, which is how `"::1\n"` validated as `::1`. */
	var ipv6Alphabet = /^[0-9a-fA-F:.]+$/;
	function isValidIPv6(value) {
		if (!ipv6Alphabet.test(value)) return false;
		return canParseURL(`http://[${value}]`);
	}
	var $ZodIPv6 = /*@__PURE__*/ $constructor("$ZodIPv6", (inst, def) => {
		var _def$pattern18;
		(_def$pattern18 = def.pattern) !== null && _def$pattern18 !== void 0 || (def.pattern = ipv6);
		$ZodStringFormat.init(inst, def);
		inst._zod.check = (payload) => {
			if (!isValidIPv6(payload.value)) payload.issues.push({
				code: "invalid_format",
				format: "ipv6",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		};
	});
	var $ZodCIDRv4 = /*@__PURE__*/ $constructor("$ZodCIDRv4", (inst, def) => {
		var _def$pattern20;
		(_def$pattern20 = def.pattern) !== null && _def$pattern20 !== void 0 || (def.pattern = cidrv4);
		$ZodStringFormat.init(inst, def);
	});
	function isValidCIDRv6(value) {
		const parts = value.split("/");
		if (parts.length !== 2) return false;
		const [address, prefix] = parts;
		if (!prefix) return false;
		const prefixNum = Number(prefix);
		if (`${prefixNum}` !== prefix) return false;
		if (prefixNum < 0 || prefixNum > 128) return false;
		return isValidIPv6(address);
	}
	var $ZodCIDRv6 = /*@__PURE__*/ $constructor("$ZodCIDRv6", (inst, def) => {
		var _def$pattern21;
		(_def$pattern21 = def.pattern) !== null && _def$pattern21 !== void 0 || (def.pattern = cidrv6);
		$ZodStringFormat.init(inst, def);
		inst._zod.check = (payload) => {
			if (!isValidCIDRv6(payload.value)) payload.issues.push({
				code: "invalid_format",
				format: "cidrv6",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		};
	});
	function isValidBase64(data) {
		if (data === "") return true;
		if (/\s/.test(data)) return false;
		if (data.length % 4 !== 0) return false;
		try {
			atob(data);
			return true;
		} catch (_unused3) {
			return false;
		}
	}
	var base64Charset = /^[0-9a-zA-Z+/]*={0,2}$/;
	var $ZodBase64 = /*@__PURE__*/ $constructor("$ZodBase64", (inst, def) => {
		var _def$pattern22;
		(_def$pattern22 = def.pattern) !== null && _def$pattern22 !== void 0 || (def.pattern = base64Charset);
		$ZodStringFormat.init(inst, def);
		inst._zod.check = (payload) => {
			if (isValidBase64(payload.value)) return;
			payload.issues.push({
				code: "invalid_format",
				format: "base64",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		};
	});
	var base64urlCharset = /^[A-Za-z0-9_-]*$/;
	function isValidBase64URL(data) {
		if (!base64urlCharset.test(data)) return false;
		const base64 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
		return isValidBase64(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
	}
	var $ZodBase64URL = /*@__PURE__*/ $constructor("$ZodBase64URL", (inst, def) => {
		var _def$pattern23;
		(_def$pattern23 = def.pattern) !== null && _def$pattern23 !== void 0 || (def.pattern = base64urlCharset);
		$ZodStringFormat.init(inst, def);
		inst._zod.check = (payload) => {
			if (isValidBase64URL(payload.value)) return;
			payload.issues.push({
				code: "invalid_format",
				format: "base64url",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		};
	});
	var $ZodE164 = /*@__PURE__*/ $constructor("$ZodE164", (inst, def) => {
		var _def$pattern24;
		(_def$pattern24 = def.pattern) !== null && _def$pattern24 !== void 0 || (def.pattern = e164);
		$ZodStringFormat.init(inst, def);
	});
	function isValidJWT(token, algorithm = null) {
		try {
			const tokensParts = token.split(".");
			if (tokensParts.length !== 3) return false;
			const [header] = tokensParts;
			if (!header) return false;
			const parsedHeader = JSON.parse(atob(header));
			if ("typ" in parsedHeader && (parsedHeader === null || parsedHeader === void 0 ? void 0 : parsedHeader.typ) !== "JWT") return false;
			if (!parsedHeader.alg) return false;
			if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm)) return false;
			return true;
		} catch (_unused4) {
			return false;
		}
	}
	var $ZodJWT = /*@__PURE__*/ $constructor("$ZodJWT", (inst, def) => {
		$ZodStringFormat.init(inst, def);
		inst._zod.check = (payload) => {
			if (isValidJWT(payload.value, def.alg)) return;
			payload.issues.push({
				code: "invalid_format",
				format: "jwt",
				input: payload.value,
				inst,
				continue: !def.abort
			});
		};
	});
	var $ZodNumber = /*@__PURE__*/ $constructor("$ZodNumber", (inst, def) => {
		$ZodType.init(inst, def);
		inst._zod.pattern = number$1;
		inst._zod.parse = (payload, _ctx) => {
			if (def.coerce) try {
				payload.value = Number(payload.value);
			} catch (_) {}
			const input = payload.value;
			if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) return payload;
			const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? String(input) : void 0 : void 0;
			payload.issues.push(_objectSpread2({
				expected: "number",
				code: "invalid_type",
				input,
				inst
			}, received ? { received } : {}));
			return payload;
		};
	});
	var $ZodNumberFormat = /*@__PURE__*/ $constructor("$ZodNumberFormat", (inst, def) => {
		$ZodCheckNumberFormat.init(inst, def);
		$ZodNumber.init(inst, def);
	});
	var $ZodBoolean = /*@__PURE__*/ $constructor("$ZodBoolean", (inst, def) => {
		$ZodType.init(inst, def);
		inst._zod.pattern = boolean$1;
		inst._zod.parse = (payload, _ctx) => {
			if (def.coerce) try {
				payload.value = Boolean(payload.value);
			} catch (_) {}
			const input = payload.value;
			if (typeof input === "boolean") return payload;
			payload.issues.push({
				expected: "boolean",
				code: "invalid_type",
				input,
				inst
			});
			return payload;
		};
	});
	var $ZodUnknown = /*@__PURE__*/ $constructor("$ZodUnknown", (inst, def) => {
		$ZodType.init(inst, def);
		inst._zod.parse = (payload) => payload;
	});
	var $ZodNever = /*@__PURE__*/ $constructor("$ZodNever", (inst, def) => {
		$ZodType.init(inst, def);
		inst._zod.parse = (payload, _ctx) => {
			payload.issues.push({
				expected: "never",
				code: "invalid_type",
				input: payload.value,
				inst
			});
			return payload;
		};
	});
	function capSize(inst, size) {
		const caps = sizeCaps(inst._zod.def.checks);
		if (!caps.length) return;
		const cap = Math.min(...caps.map((c) => c[0]));
		const parse = inst._zod.parse;
		inst._zod.parse = (payload, ctx) => {
			const n = size(payload.value);
			if (n > cap && !(ctx === null || ctx === void 0 ? void 0 : ctx.skipChecks) && (ctx === null || ctx === void 0 ? void 0 : ctx.direction) !== "backward") {
				for (const [max, ch] of sizeCaps(inst._zod.def.checks)) if (n > max && ch._zod.def.when(payload)) {
					const start = payload.issues.length;
					ch._zod.check(payload);
					payload.issues[start].continue = false;
					attachSchema(payload.issues, start, inst);
					return payload;
				}
			}
			return parse(payload, ctx);
		};
	}
	var arraySize = (input) => Array.isArray(input) ? input.length : -1;
	function handleArrayResult(result, final, index) {
		if (result.issues.length) final.issues.push(...prefixIssues(index, result.issues));
		final.value[index] = result.value;
	}
	var $ZodArray = /*@__PURE__*/ $constructor("$ZodArray", (inst, def) => {
		$ZodType.init(inst, def);
		const memo = globalConfig.memoizer;
		memo === null || memo === void 0 || memo.attach(inst);
		inst._zod.parse = (payload, ctx) => {
			const input = payload.value;
			if (!Array.isArray(input)) {
				payload.issues.push({
					expected: "array",
					code: "invalid_type",
					input,
					inst
				});
				return payload;
			}
			payload.value = memo ? memo.alloc(inst, payload, Array(input.length), ctx) : Array(input.length);
			const proms = [];
			const abortEarly = ctx === null || ctx === void 0 ? void 0 : ctx.abortEarly;
			for (let i = 0; i < input.length; i++) {
				const item = input[i];
				const result = def.element._zod.run({
					value: item,
					issues: []
				}, ctx);
				if (result instanceof Promise) proms.push(result.then((result) => handleArrayResult(result, payload, i)));
				else {
					handleArrayResult(result, payload, i);
					if (abortEarly && result.issues.length !== 0 && aborted(result)) break;
				}
			}
			if (proms.length) return Promise.all(proms).then(() => payload);
			return payload;
		};
		capSize(inst, arraySize);
	});
	function handlePropertyResult(result, final, key, input, optin, optout) {
		const isPresent = key in input;
		const isOptionalOut = optout === "optional";
		if (!isPresent && isOptionalOut && optin === "optional") return;
		if (result.issues.length) {
			if (optin !== void 0 && isOptionalOut && !isPresent) return;
			final.issues.push(...prefixIssues(key, result.issues));
		}
		if (!isPresent && optin === void 0) {
			if (!result.issues.length) final.issues.push({
				code: "invalid_type",
				expected: "nonoptional",
				input: void 0,
				path: [key]
			});
			return;
		}
		if (result.value === void 0) {
			if (isPresent || optin === "defaulted" && !isOptionalOut) final.value[key] = void 0;
		} else final.value[key] = result.value;
	}
	var NO_SYMBOL_KEYS = [];
	function normalizeDef(def) {
		const keys = Object.keys(def.shape);
		const ownSymbols = Object.getOwnPropertySymbols(def.shape);
		const symbolKeys = ownSymbols.length ? ownSymbols : NO_SYMBOL_KEYS;
		const allKeys = symbolKeys.length ? [...keys, ...symbolKeys] : keys;
		for (const k of allKeys) {
			var _def$shape;
			if (!((_def$shape = def.shape) === null || _def$shape === void 0 || (_def$shape = _def$shape[k]) === null || _def$shape === void 0 || (_def$shape = _def$shape._zod) === null || _def$shape === void 0 || (_def$shape = _def$shape.traits) === null || _def$shape === void 0 ? void 0 : _def$shape.has("$ZodType"))) throw new Error(`Invalid element at key "${String(k)}": expected a Zod schema`);
		}
		const okeys = optionalKeys(def.shape);
		return _objectSpread2(_objectSpread2({}, def), {}, {
			allKeys,
			symbolKeys,
			keySet: new Set(keys),
			numKeys: keys.length,
			optionalKeys: new Set(okeys)
		});
	}
	function handleCatchall(proms, input, payload, ctx, def, inst, abortEarly) {
		const unrecognized = [];
		const keySet = def.keySet;
		const _catchall = def.catchall._zod;
		const t = _catchall.def.type;
		const optin = _catchall.optin;
		const optout = _catchall.optout;
		let seen = 0;
		for (const key in input) {
			if (abortEarly && payload.issues.length !== seen) {
				if (aborted(payload, seen)) break;
				seen = payload.issues.length;
			}
			if (keySet.has(key)) continue;
			if (key === "__proto__") {
				if (t === "never") unrecognized.push(key);
				continue;
			}
			if (t === "never") {
				unrecognized.push(key);
				continue;
			}
			const r = _catchall.run({
				value: input[key],
				issues: []
			}, ctx);
			if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, optin, optout)));
			else handlePropertyResult(r, payload, key, input, optin, optout);
		}
		if (unrecognized.length) payload.issues.push({
			code: "unrecognized_keys",
			keys: unrecognized,
			input,
			inst,
			continue: true
		});
		if (!proms.length) return payload;
		return Promise.all(proms).then(() => {
			return payload;
		});
	}
	var $ZodObject = /*@__PURE__*/ $constructor("$ZodObject", (inst, def) => {
		var _def$shape2;
		$ZodType.init(inst, def);
		const desc = Object.getOwnPropertyDescriptor(def, "shape");
		const sh = (desc === null || desc === void 0 ? void 0 : desc.get) ? desc.get.raw : (_def$shape2 = def.shape) !== null && _def$shape2 !== void 0 ? _def$shape2 : {};
		if (sh) {
			const get = () => {
				const newSh = _objectSpread2({}, sh);
				Object.defineProperty(def, "shape", { value: newSh });
				get.raw = newSh;
				return newSh;
			};
			get.raw = sh;
			Object.defineProperty(def, "shape", { get });
		}
		const _normalized = cached(() => normalizeDef(def));
		defineLazyInternal(inst, "propValues", (zod) => {
			const shape = zod.def.shape;
			const propValues = {};
			for (const key in shape) {
				const field = shape[key]._zod;
				if (field.values) {
					if (!Object.prototype.hasOwnProperty.call(propValues, key)) assignProp(propValues, key, /* @__PURE__ */ new Set());
					for (const v of field.values) propValues[key].add(v);
					if (field.optin !== void 0) propValues[key].add(void 0);
				}
			}
			return propValues;
		});
		const isObject$2 = isObject;
		const catchall = def.catchall;
		let value;
		const memo = globalConfig.memoizer;
		memo === null || memo === void 0 || memo.attach(inst);
		inst._zod.parse = (payload, ctx) => {
			var _value;
			(_value = value) !== null && _value !== void 0 || (value = _normalized.value);
			const input = payload.value;
			if (!isObject$2(input)) {
				payload.issues.push({
					expected: "object",
					code: "invalid_type",
					input,
					inst
				});
				return payload;
			}
			payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
			const proms = [];
			const shape = value.shape;
			const abortEarly = ctx === null || ctx === void 0 ? void 0 : ctx.abortEarly;
			let seen = payload.issues.length;
			for (const key of value.allKeys) {
				if (abortEarly && payload.issues.length !== seen) {
					if (aborted(payload, seen)) break;
					seen = payload.issues.length;
				}
				if (key === "__proto__") continue;
				const el = shape[key];
				const optin = el._zod.optin;
				const optout = el._zod.optout;
				const r = el._zod.run({
					value: input[key],
					issues: []
				}, ctx);
				if (r instanceof Promise) proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, optin, optout)));
				else handlePropertyResult(r, payload, key, input, optin, optout);
			}
			if (!catchall) return proms.length ? Promise.all(proms).then(() => payload) : payload;
			return handleCatchall(proms, input, payload, ctx, _normalized.value, inst, abortEarly === true);
		};
	});
	var $ZodObjectJIT = /*@__PURE__*/ $constructor("$ZodObjectJIT", (inst, def) => {
		$ZodObject.init(inst, def);
		const superParse = inst._zod.parse;
		const _normalized = cached(() => normalizeDef(def));
		const memo = globalConfig.memoizer;
		const generateFastpass = (shape) => {
			const normalized = _normalized.value;
			const syms = normalized.symbolKeys;
			const doc = new Doc(["payload", "ctx"], {
				shape,
				inst,
				memo,
				syms
			});
			const parseStr = (k) => `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
			const prefixStr = (id, k) => `
          let ${id}_ab = false;
          for (let i = 0; i < ${id}.issues.length; i++) {
            const iss = ${id}.issues[i];
            iss.path = iss.path ? [${k}, ...iss.path] : [${k}];
            payload.issues.push(iss);
            if (iss.continue !== true) ${id}_ab = true;
          }
          if (${id}_ab && ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }`;
			doc.write(`const input = payload.value;`);
			const ids = Object.create(null);
			let counter = 0;
			for (const key of normalized.allKeys) ids[key] = `key_${counter++}`;
			doc.write(memo ? `const newResult = memo.alloc(inst, payload, {}, ctx);` : `const newResult = {};`);
			for (const key of normalized.allKeys) {
				var _schema$_zod, _schema$_zod2;
				if (key === "__proto__") continue;
				const id = ids[key];
				const k = typeof key === "symbol" ? `syms[${syms.indexOf(key)}]` : esc(key);
				const isPresent = `${k} in input`;
				const schema = shape[key];
				const optin = schema === null || schema === void 0 || (_schema$_zod = schema._zod) === null || _schema$_zod === void 0 ? void 0 : _schema$_zod.optin;
				const isOptionalIn = optin !== void 0;
				const isOptionalOut = (schema === null || schema === void 0 || (_schema$_zod2 = schema._zod) === null || _schema$_zod2 === void 0 ? void 0 : _schema$_zod2.optout) === "optional";
				doc.write(`const ${id} = ${parseStr(k)};`);
				if (isOptionalIn && isOptionalOut) {
					const assign = optin === "optional" ? `${id}_present` : `${id}.value !== undefined || ${id}_present`;
					doc.write(`
        const ${id}_present = ${isPresent};
        if (!${id}.issues.length || ${id}_present) {
          if (${id}.issues.length) {${prefixStr(id, k)}
          }

          if (${assign}) {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
				} else if (!isOptionalIn) doc.write(`
        const ${id}_present = ${isPresent};
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
          if (ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }
        }

        if (${id}_present) {
          newResult[${k}] = ${id}.value;
        }

      `);
				else {
					doc.write(`
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
      `);
					if (optin === "defaulted") doc.write(`newResult[${k}] = ${id}.value;`);
					else doc.write(`
        if (${id}.value !== undefined || ${isPresent}) {
          newResult[${k}] = ${id}.value;
        }
      `);
				}
			}
			doc.write(`payload.value = newResult;`);
			doc.write(`return payload;`);
			return doc.compile();
		};
		let fastpass;
		const isObject$1 = isObject;
		const jit = !globalConfig.jitless;
		const fastEnabled = jit && allowsEval.value;
		const catchall = def.catchall;
		let value;
		inst._zod.parse = (payload, ctx) => {
			var _value2;
			(_value2 = value) !== null && _value2 !== void 0 || (value = _normalized.value);
			const input = payload.value;
			if (!isObject$1(input)) {
				payload.issues.push({
					expected: "object",
					code: "invalid_type",
					input,
					inst
				});
				return payload;
			}
			if (jit && fastEnabled && (ctx === null || ctx === void 0 ? void 0 : ctx.async) === false && ctx.jitless !== true) {
				if (!fastpass) fastpass = generateFastpass(def.shape);
				payload = fastpass(payload, ctx);
				if (!catchall) return payload;
				return handleCatchall([], input, payload, ctx, value, inst, (ctx === null || ctx === void 0 ? void 0 : ctx.abortEarly) === true);
			}
			return superParse(payload, ctx);
		};
	});
	function handleUnionResults(results, final, inst, ctx) {
		for (const result of results) if (result.issues.length === 0) {
			final.value = result.value;
			return final;
		}
		const nonaborted = results.filter((r) => !aborted(r));
		if (nonaborted.length === 1) {
			final.value = nonaborted[0].value;
			return nonaborted[0];
		}
		final.issues.push({
			code: "invalid_union",
			input: final.value,
			inst,
			errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
		});
		return final;
	}
	var $ZodUnion = /*@__PURE__*/ $constructor("$ZodUnion", (inst, def) => {
		$ZodType.init(inst, def);
		defineLazyInternal(inst, "optin", (zod) => zod.def.options.some((o) => o._zod.optin === "defaulted") ? "defaulted" : zod.def.options.some((o) => o._zod.optin !== void 0) ? "optional" : void 0);
		defineLazyInternal(inst, "optout", (zod) => zod.def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
		defineLazyInternal(inst, "values", (zod) => {
			if (zod.def.options.every((o) => o._zod.values)) return new Set(zod.def.options.flatMap((option) => Array.from(option._zod.values)));
		});
		defineLazyInternal(inst, "pattern", (zod) => {
			if (zod.def.options.every((o) => o._zod.pattern)) {
				const patterns = zod.def.options.map((o) => o._zod.pattern);
				return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
			}
		});
		const first = def.options.length === 1 ? def.options[0]._zod.run : null;
		inst._zod.parse = (payload, ctx) => {
			if (first) return first(payload, ctx);
			let async = false;
			const results = [];
			for (const option of def.options) {
				const result = option._zod.run({
					value: payload.value,
					issues: []
				}, ctx);
				if (result instanceof Promise) {
					results.push(result);
					async = true;
				} else {
					if (result.issues.length === 0) return result;
					results.push(result);
				}
			}
			if (!async) return handleUnionResults(results, payload, inst, ctx);
			return Promise.all(results).then((results) => {
				return handleUnionResults(results, payload, inst, ctx);
			});
		};
	});
	function discriminatorMap(def) {
		const map = /* @__PURE__ */ new Map();
		for (const option of def.options) {
			var _option$_zod$propValu;
			const values = (_option$_zod$propValu = option._zod.propValues) === null || _option$_zod$propValu === void 0 ? void 0 : _option$_zod$propValu[def.discriminator];
			if (!values || values.size === 0) throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
			for (const value of values) if (map.has(value)) {
				if (value !== void 0) throw new Error(`Duplicate discriminator value "${String(value)}"`);
				map.set(value, null);
			} else map.set(value, option);
		}
		return map;
	}
	var $ZodDiscriminatedUnion = /*@__PURE__*/ $constructor("$ZodDiscriminatedUnion", (inst, def) => {
		def.inclusive = false;
		$ZodUnion.init(inst, def);
		const _super = inst._zod.parse;
		defineLazyInternal(inst, "propValues", (zod) => {
			var _propValues$zod$def$d;
			const propValues = {};
			let undefinedCount = 0;
			for (const option of zod.def.options) {
				var _pv$zod$def$discrimin;
				const pv = option._zod.propValues;
				if (!pv || Object.keys(pv).length === 0) throw new Error(`Invalid discriminated union option at index "${zod.def.options.indexOf(option)}"`);
				if ((_pv$zod$def$discrimin = pv[zod.def.discriminator]) === null || _pv$zod$def$discrimin === void 0 ? void 0 : _pv$zod$def$discrimin.has(void 0)) undefinedCount++;
				for (const [k, v] of Object.entries(pv)) {
					if (!Object.prototype.hasOwnProperty.call(propValues, k)) assignProp(propValues, k, /* @__PURE__ */ new Set());
					for (const val of v) propValues[k].add(val);
				}
			}
			if (!zod.def.unionFallback && undefinedCount > 1) (_propValues$zod$def$d = propValues[zod.def.discriminator]) === null || _propValues$zod$def$d === void 0 || _propValues$zod$def$d.delete(void 0);
			return propValues;
		});
		def.options.forEach((option, i) => {
			const propShape = rawShape(option._zod.def);
			if (propShape && !Object.prototype.hasOwnProperty.call(propShape, def.discriminator)) throw new Error(`Invalid discriminated union option at index "${i}"`);
		});
		const disc = cached(() => discriminatorMap(def));
		inst._zod.parse = (payload, ctx) => {
			const input = payload.value;
			if (!isObject(input)) {
				payload.issues.push({
					code: "invalid_type",
					expected: "object",
					input,
					inst
				});
				return payload;
			}
			const value = input === null || input === void 0 ? void 0 : input[def.discriminator];
			const opt = disc.value.get(value);
			if (opt && (value !== void 0 || ctx.direction !== "backward")) return opt._zod.run(payload, ctx);
			if (def.unionFallback || ctx.direction === "backward") return _super(payload, ctx);
			payload.issues.push({
				code: "invalid_union",
				errors: [],
				note: "No matching discriminator",
				discriminator: def.discriminator,
				options: Array.from(disc.value.keys()).filter((value) => disc.value.get(value) !== null),
				input,
				path: [def.discriminator],
				inst
			});
			return payload;
		};
	});
	var $ZodIntersection = /*@__PURE__*/ $constructor("$ZodIntersection", (inst, def) => {
		$ZodType.init(inst, def);
		inst._zod.parse = (payload, ctx) => {
			const input = payload.value;
			const left = def.left._zod.run({
				value: input,
				issues: []
			}, ctx);
			const right = def.right._zod.run({
				value: input,
				issues: []
			}, ctx);
			if (left instanceof Promise || right instanceof Promise) return Promise.all([left, right]).then(([left, right]) => {
				return handleIntersectionResults(payload, left, right);
			});
			return handleIntersectionResults(payload, left, right);
		};
	});
	function mergeValues(a, b) {
		if (a === b) return {
			valid: true,
			data: a
		};
		if (a instanceof Date && b instanceof Date && +a === +b) return {
			valid: true,
			data: a
		};
		if (isPlainObject(a) && isPlainObject(b)) {
			const bKeys = Object.keys(b);
			const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
			const newObj = _objectSpread2(_objectSpread2({}, a), b);
			if (Object.prototype.hasOwnProperty.call(newObj, "__proto__")) delete newObj.__proto__;
			for (const key of sharedKeys) {
				if (key === "__proto__") continue;
				const sharedValue = mergeValues(a[key], b[key]);
				if (!sharedValue.valid) return {
					valid: false,
					mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
				};
				newObj[key] = sharedValue.data;
			}
			return {
				valid: true,
				data: newObj
			};
		}
		if (Array.isArray(a) && Array.isArray(b)) {
			if (a.length !== b.length) return {
				valid: false,
				mergeErrorPath: []
			};
			const newArray = [];
			for (let index = 0; index < a.length; index++) {
				const itemA = a[index];
				const itemB = b[index];
				const sharedValue = mergeValues(itemA, itemB);
				if (!sharedValue.valid) return {
					valid: false,
					mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
				};
				newArray.push(sharedValue.data);
			}
			return {
				valid: true,
				data: newArray
			};
		}
		return {
			valid: false,
			mergeErrorPath: []
		};
	}
	function handleIntersectionResults(result, left, right) {
		const unrecKeys = /* @__PURE__ */ new Map();
		let unrecIssue;
		const keyIssues = /* @__PURE__ */ new Map();
		const collect = (iss, side) => {
			var _iss$path, _iss$path2;
			let keys;
			if (iss.code === "unrecognized_keys" && !((_iss$path = iss.path) === null || _iss$path === void 0 ? void 0 : _iss$path.length)) {
				var _unrecIssue;
				(_unrecIssue = unrecIssue) !== null && _unrecIssue !== void 0 || (unrecIssue = iss);
				keys = iss.keys;
			} else if (iss.code === "invalid_key" && iss.origin === "record" && ((_iss$path2 = iss.path) === null || _iss$path2 === void 0 ? void 0 : _iss$path2.length) === 1) {
				const k = String(iss.path[0]);
				if (!keyIssues.has(k)) keyIssues.set(k, iss);
				keys = [k];
			} else return false;
			for (const k of keys) {
				if (!unrecKeys.has(k)) unrecKeys.set(k, {});
				unrecKeys.get(k)[side] = true;
			}
			return true;
		};
		for (const iss of left.issues) if (!collect(iss, "l")) result.issues.push(iss);
		for (const iss of right.issues) if (!collect(iss, "r")) result.issues.push(iss);
		const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
		if (bothKeys.length) {
			const aggregated = unrecIssue ? bothKeys.filter((k) => unrecIssue.keys.includes(k)) : [];
			if (aggregated.length) result.issues.push(_objectSpread2(_objectSpread2({}, unrecIssue), {}, { keys: aggregated }));
			for (const k of bothKeys) if (!aggregated.includes(k) && keyIssues.has(k)) result.issues.push(keyIssues.get(k));
		}
		const merged = mergeValues(left.value, right.value);
		if (!merged.valid) {
			if (aborted(result)) return result;
			throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
		}
		result.value = merged.data;
		return result;
	}
	var $ZodTuple = /*@__PURE__*/ $constructor("$ZodTuple", (inst, def) => {
		$ZodType.init(inst, def);
		const items = def.items;
		const memo = globalConfig.memoizer;
		memo === null || memo === void 0 || memo.attach(inst);
		inst._zod.parse = (payload, ctx) => {
			const input = payload.value;
			if (!Array.isArray(input)) {
				payload.issues.push({
					input,
					inst,
					expected: "tuple",
					code: "invalid_type"
				});
				return payload;
			}
			payload.value = memo ? memo.alloc(inst, payload, [], ctx) : [];
			const proms = [];
			const optinStart = getTupleOptStart(items, "optin");
			const optoutStart = getTupleOptStart(items, "optout");
			if (!def.rest) {
				if (input.length < optinStart) {
					payload.issues.push({
						code: "too_small",
						minimum: optinStart,
						inclusive: true,
						input,
						inst,
						origin: "array"
					});
					return payload;
				}
				if (input.length > items.length) payload.issues.push({
					code: "too_big",
					maximum: items.length,
					inclusive: true,
					input,
					inst,
					origin: "array"
				});
			}
			const itemResults = new Array(items.length);
			const abortEarly = def.rest ? ctx === null || ctx === void 0 ? void 0 : ctx.abortEarly : void 0;
			let itemAborted = false;
			for (let i = 0; i < items.length; i++) {
				const r = items[i]._zod.run({
					value: input[i],
					issues: []
				}, ctx);
				if (r instanceof Promise) proms.push(r.then((rr) => {
					itemResults[i] = rr;
				}));
				else {
					itemResults[i] = r;
					if (abortEarly && !itemAborted && r.issues.length) itemAborted = aborted(r);
				}
			}
			if (def.rest && !itemAborted) {
				let i = items.length - 1;
				const rest = input.slice(items.length);
				let seen = payload.issues.length;
				for (const el of rest) {
					if (abortEarly && payload.issues.length !== seen) {
						if (aborted(payload, seen)) break;
						seen = payload.issues.length;
					}
					i++;
					const result = def.rest._zod.run({
						value: el,
						issues: []
					}, ctx);
					if (result instanceof Promise) proms.push(result.then((r) => handleTupleResult(r, payload, i)));
					else handleTupleResult(result, payload, i);
				}
			}
			if (proms.length) return Promise.all(proms).then(() => handleTupleResults(itemResults, payload, items, input, optoutStart));
			return handleTupleResults(itemResults, payload, items, input, optoutStart);
		};
	});
	function getTupleOptStart(items, key) {
		for (let i = items.length - 1; i >= 0; i--) if (!(key === "optin" ? items[i]._zod.optin !== void 0 : items[i]._zod.optout === "optional")) return i + 1;
		return 0;
	}
	function handleTupleResult(result, final, index) {
		if (result.issues.length) final.issues.push(...prefixIssues(index, result.issues));
		final.value[index] = result.value;
	}
	function handleTupleResults(itemResults, final, items, input, optoutStart) {
		for (let i = 0; i < items.length; i++) {
			const r = itemResults[i];
			const isPresent = i < input.length;
			if (!isPresent && i >= optoutStart && items[i]._zod.optin === "optional") {
				final.value.length = i;
				break;
			}
			if (r.issues.length) {
				if (!isPresent && i >= optoutStart) {
					final.value.length = i;
					break;
				}
				final.issues.push(...prefixIssues(i, r.issues));
			}
			final.value[i] = r.value;
		}
		for (let i = final.value.length - 1; i >= input.length; i--) if (items[i]._zod.optout === "optional" && final.value[i] === void 0) final.value.length = i;
		else break;
		return final;
	}
	var $ZodRecord = /*@__PURE__*/ $constructor("$ZodRecord", (inst, def) => {
		$ZodType.init(inst, def);
		const memo = globalConfig.memoizer;
		memo === null || memo === void 0 || memo.attach(inst);
		inst._zod.parse = (payload, ctx) => {
			const input = payload.value;
			if (!isPlainObject(input)) {
				payload.issues.push({
					expected: "record",
					code: "invalid_type",
					input,
					inst
				});
				return payload;
			}
			const proms = [];
			const values = def.keyType._zod.values;
			if (values && !def.partial) {
				payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
				const recordKeys = /* @__PURE__ */ new Set();
				for (const key of values) if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
					recordKeys.add(typeof key === "number" ? key.toString() : key);
					if (key === "__proto__") continue;
					const keyResult = def.keyType._zod.run({
						value: key,
						issues: []
					}, ctx);
					if (keyResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
					if (keyResult.issues.length) {
						payload.issues.push({
							code: "invalid_key",
							origin: "record",
							issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
							input: key,
							path: [key],
							inst
						});
						continue;
					}
					const outKey = keyResult.value;
					if (outKey === "__proto__") continue;
					const result = def.valueType._zod.run({
						value: input[key],
						issues: []
					}, ctx);
					if (result instanceof Promise) proms.push(result.then((result) => {
						if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
						payload.value[outKey] = result.value;
					}));
					else {
						if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
						payload.value[outKey] = result.value;
					}
				}
				let unrecognized;
				for (const key in input) if (!recordKeys.has(key)) {
					if (def.mode === "loose") {
						if (key === "__proto__") continue;
						payload.value[key] = input[key];
					} else {
						var _unrecognized;
						unrecognized = (_unrecognized = unrecognized) !== null && _unrecognized !== void 0 ? _unrecognized : [];
						unrecognized.push(key);
					}
				}
				if (unrecognized && unrecognized.length > 0) payload.issues.push({
					code: "unrecognized_keys",
					input,
					inst,
					keys: unrecognized,
					continue: true
				});
			} else {
				payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
				let unrecognized;
				for (const key of Reflect.ownKeys(input)) {
					if (key === "__proto__") continue;
					if (!Object.prototype.propertyIsEnumerable.call(input, key)) continue;
					let keyResult = def.keyType._zod.run({
						value: key,
						issues: []
					}, ctx);
					if (keyResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
					if (typeof key === "string" && number$1.test(key) && keyResult.issues.length) {
						const retryResult = def.keyType._zod.run({
							value: Number(key),
							issues: []
						}, ctx);
						if (retryResult instanceof Promise) throw new Error("Async schemas not supported in object keys currently");
						if (retryResult.issues.length === 0) keyResult = retryResult;
					}
					if (keyResult.issues.length) {
						if (def.mode === "loose") payload.value[key] = input[key];
						else if (values) {
							var _unrecognized2;
							unrecognized = (_unrecognized2 = unrecognized) !== null && _unrecognized2 !== void 0 ? _unrecognized2 : [];
							unrecognized.push(key);
						} else payload.issues.push({
							code: "invalid_key",
							origin: "record",
							issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
							input: key,
							path: [key],
							inst
						});
						continue;
					}
					const outKey = keyResult.value;
					if (outKey === "__proto__") continue;
					const result = def.valueType._zod.run({
						value: input[key],
						issues: []
					}, ctx);
					if (result instanceof Promise) proms.push(result.then((result) => {
						if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
						payload.value[outKey] = result.value;
					}));
					else {
						if (result.issues.length) payload.issues.push(...prefixIssues(key, result.issues));
						payload.value[outKey] = result.value;
					}
				}
				if (unrecognized && unrecognized.length > 0) payload.issues.push({
					code: "unrecognized_keys",
					input,
					inst,
					keys: unrecognized,
					continue: true
				});
			}
			if (proms.length) return Promise.all(proms).then(() => payload);
			return payload;
		};
	});
	var $ZodEnum = /*@__PURE__*/ $constructor("$ZodEnum", (inst, def) => {
		$ZodType.init(inst, def);
		const values = getEnumValues(def.entries);
		const valuesSet = new Set(values);
		inst._zod.values = valuesSet;
		defineLazyInternal(inst, "pattern", (zod) => {
			const patternValues = getEnumValues(zod.def.entries).filter((k) => propertyKeyTypes.has(typeof k));
			return new RegExp(patternValues.length ? `^(${patternValues.map((o) => escapeRegex(o.toString())).join("|")})$` : "^[^\\s\\S]$");
		});
		inst._zod.parse = (payload, _ctx) => {
			const input = payload.value;
			if (valuesSet.has(input)) return payload;
			payload.issues.push({
				code: "invalid_value",
				values,
				input,
				inst
			});
			return payload;
		};
	});
	var $ZodLiteral = /*@__PURE__*/ $constructor("$ZodLiteral", (inst, def) => {
		$ZodType.init(inst, def);
		const values = new Set(def.values);
		inst._zod.values = values;
		defineLazyInternal(inst, "pattern", (zod) => {
			const vals = zod.def.values;
			return new RegExp(vals.length ? `^(${vals.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$` : "^[^\\s\\S]$");
		});
		inst._zod.parse = (payload, _ctx) => {
			const input = payload.value;
			if (values.has(input)) return payload;
			payload.issues.push({
				code: "invalid_value",
				values: def.values,
				input,
				inst
			});
			return payload;
		};
	});
	var $ZodTransform = /*@__PURE__*/ $constructor("$ZodTransform", (inst, def) => {
		var _core$globalConfig$me;
		$ZodType.init(inst, def);
		inst._zod.optin = "optional";
		(_core$globalConfig$me = globalConfig.memoizer) === null || _core$globalConfig$me === void 0 || _core$globalConfig$me.guard(inst);
		inst._zod.parse = (payload, ctx) => {
			if (ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
			const _out = def.transform(payload.value, payload);
			if (ctx.async) return (_out instanceof Promise ? _out : Promise.resolve(_out)).then((output) => {
				payload.value = output;
				return payload;
			});
			if (_out instanceof Promise) throw new $ZodAsyncError();
			payload.value = _out;
			return payload;
		};
	});
	function handleOptionalResult(payload, result) {
		payload.value = result.issues.length ? void 0 : result.value;
		return payload;
	}
	var $ZodOptional = /*@__PURE__*/ $constructor("$ZodOptional", (inst, def) => {
		$ZodType.init(inst, def);
		defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
		inst._zod.optout = "optional";
		defineLazyInternal(inst, "values", (zod) => {
			const values = zod.def.innerType._zod.values;
			return values ? /* @__PURE__ */ new Set([...values, void 0]) : void 0;
		});
		defineLazyInternal(inst, "pattern", (zod) => {
			const pattern = zod.def.innerType._zod.pattern;
			return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
		});
		inst._zod.parse = (payload, ctx) => {
			if (payload.value === void 0) {
				if (def.innerType._zod.optin !== "defaulted") return payload;
				const result = def.innerType._zod.run({
					value: payload.value,
					issues: []
				}, ctx);
				if (result instanceof Promise) return result.then((result) => handleOptionalResult(payload, result));
				return handleOptionalResult(payload, result);
			}
			return def.innerType._zod.run(payload, ctx);
		};
	});
	var $ZodExactOptional = /*@__PURE__*/ $constructor("$ZodExactOptional", (inst, def) => {
		$ZodOptional.init(inst, def);
		defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
		defineLazyInternal(inst, "pattern", (zod) => zod.def.innerType._zod.pattern);
		inst._zod.parse = (payload, ctx) => {
			return def.innerType._zod.run(payload, ctx);
		};
	});
	var $ZodNullable = /*@__PURE__*/ $constructor("$ZodNullable", (inst, def) => {
		$ZodType.init(inst, def);
		defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin);
		defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
		defineLazyInternal(inst, "pattern", (zod) => {
			const pattern = zod.def.innerType._zod.pattern;
			return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
		});
		defineLazyInternal(inst, "values", (zod) => {
			return zod.def.innerType._zod.values ? /* @__PURE__ */ new Set([...zod.def.innerType._zod.values, null]) : void 0;
		});
		inst._zod.parse = (payload, ctx) => {
			if (payload.value === null) return payload;
			return def.innerType._zod.run(payload, ctx);
		};
	});
	var $ZodDefault = /*@__PURE__*/ $constructor("$ZodDefault", (inst, def) => {
		$ZodType.init(inst, def);
		inst._zod.optin = "defaulted";
		defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
		inst._zod.parse = (payload, ctx) => {
			if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
			if (payload.value === void 0) {
				payload.value = def.defaultValue;
				/**
				* $ZodDefault returns the default value immediately in forward direction.
				* It doesn't pass the default value into the validator ("prefault"). There's no reason to pass the default value through validation. The validity of the default is enforced by TypeScript statically. Otherwise, it's the responsibility of the user to ensure the default is valid. In the case of pipes with divergent in/out types, you can specify the default on the `in` schema of your ZodPipe to set a "prefault" for the pipe.   */
				return payload;
			}
			const result = def.innerType._zod.run(payload, ctx);
			if (result instanceof Promise) return result.then((result) => handleDefaultResult(result, def));
			return handleDefaultResult(result, def);
		};
	});
	function handleDefaultResult(payload, def) {
		if (payload.value === void 0) payload.value = def.defaultValue;
		return payload;
	}
	var $ZodPrefault = /*@__PURE__*/ $constructor("$ZodPrefault", (inst, def) => {
		$ZodType.init(inst, def);
		inst._zod.optin = "defaulted";
		defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
		inst._zod.parse = (payload, ctx) => {
			if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
			if (payload.value === void 0) payload.value = def.defaultValue;
			return def.innerType._zod.run(payload, ctx);
		};
	});
	var $ZodNonOptional = /*@__PURE__*/ $constructor("$ZodNonOptional", (inst, def) => {
		$ZodType.init(inst, def);
		defineLazyInternal(inst, "values", (zod) => {
			const v = zod.def.innerType._zod.values;
			return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
		});
		inst._zod.parse = (payload, ctx) => {
			const result = def.innerType._zod.run(payload, ctx);
			if (result instanceof Promise) return result.then((result) => handleNonOptionalResult(result, inst));
			return handleNonOptionalResult(result, inst);
		};
	});
	function handleNonOptionalResult(payload, inst) {
		if (!payload.issues.length && payload.value === void 0) payload.issues.push({
			code: "invalid_type",
			expected: "nonoptional",
			input: payload.value,
			inst
		});
		return payload;
	}
	function handleCatchResult(payload, result, def, ctx) {
		if (!result.issues.length) {
			payload.value = result.value;
			if (result.memo) payload.memo = true;
			return payload;
		}
		payload.value = def.catchValue(_objectSpread2(_objectSpread2({}, result), {}, {
			value: payload.value,
			error: { issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config())) },
			input: payload.value
		}));
		return payload;
	}
	var $ZodCatch = /*@__PURE__*/ $constructor("$ZodCatch", (inst, def) => {
		$ZodType.init(inst, def);
		defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
		defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
		defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
		inst._zod.parse = (payload, ctx) => {
			if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
			const result = def.innerType._zod.run({
				value: payload.value,
				issues: []
			}, ctx);
			if (result instanceof Promise) return result.then((result) => handleCatchResult(payload, result, def, ctx));
			return handleCatchResult(payload, result, def, ctx);
		};
	});
	var $ZodPipe = /*@__PURE__*/ $constructor("$ZodPipe", (inst, def) => {
		$ZodType.init(inst, def);
		defineLazyInternal(inst, "values", (zod) => zod.def.in._zod.values);
		defineLazyInternal(inst, "optin", (zod) => zod.def.in._zod.optin);
		defineLazyInternal(inst, "optout", (zod) => zod.def.out._zod.optout);
		defineLazyInternal(inst, "propValues", (zod) => zod.def.in._zod.propValues);
		inst._zod.parse = (payload, ctx) => {
			if (ctx.direction === "backward") {
				const right = def.out._zod.run(payload, ctx);
				if (right instanceof Promise) return right.then((right) => handlePipeResult(right, def.in, ctx));
				return handlePipeResult(right, def.in, ctx);
			}
			const left = def.in._zod.run(payload, ctx);
			if (left instanceof Promise) return left.then((left) => handlePipeResult(left, def.out, ctx));
			return handlePipeResult(left, def.out, ctx);
		};
	});
	function handlePipeResult(left, next, ctx) {
		if (left.issues.some((iss) => iss.code !== "unrecognized_keys")) {
			left.aborted = true;
			return left;
		}
		return next._zod.run({
			value: left.value,
			issues: left.issues
		}, ctx);
	}
	var $ZodReadonly = /*@__PURE__*/ $constructor("$ZodReadonly", (inst, def) => {
		$ZodType.init(inst, def);
		defineLazyInternal(inst, "propValues", (zod) => zod.def.innerType._zod.propValues);
		defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
		defineLazyInternal(inst, "optin", (zod) => {
			var _zod$def$innerType;
			return (_zod$def$innerType = zod.def.innerType) === null || _zod$def$innerType === void 0 || (_zod$def$innerType = _zod$def$innerType._zod) === null || _zod$def$innerType === void 0 ? void 0 : _zod$def$innerType.optin;
		});
		defineLazyInternal(inst, "optout", (zod) => {
			var _zod$def$innerType2;
			return (_zod$def$innerType2 = zod.def.innerType) === null || _zod$def$innerType2 === void 0 || (_zod$def$innerType2 = _zod$def$innerType2._zod) === null || _zod$def$innerType2 === void 0 ? void 0 : _zod$def$innerType2.optout;
		});
		inst._zod.parse = (payload, ctx) => {
			if (ctx.direction === "backward") return def.innerType._zod.run(payload, ctx);
			const result = def.innerType._zod.run(payload, ctx);
			if (result instanceof Promise) return result.then(handleReadonlyResult);
			return handleReadonlyResult(result);
		};
	});
	function handleReadonlyResult(payload) {
		if (!payload.memo) payload.value = Object.freeze(payload.value);
		return payload;
	}
	var $ZodLazy = /*@__PURE__*/ $constructor("$ZodLazy", (inst, def) => {
		$ZodType.init(inst, def);
		defineLazy(inst._zod, "innerType", () => {
			const d = def;
			if (!d._cachedInner) d._cachedInner = def.getter();
			return d._cachedInner;
		});
		defineLazyInternal(inst, "pattern", (zod) => {
			var _zod$innerType;
			return (_zod$innerType = zod.innerType) === null || _zod$innerType === void 0 || (_zod$innerType = _zod$innerType._zod) === null || _zod$innerType === void 0 ? void 0 : _zod$innerType.pattern;
		});
		defineLazyInternal(inst, "propValues", (zod) => {
			var _zod$innerType2;
			return (_zod$innerType2 = zod.innerType) === null || _zod$innerType2 === void 0 || (_zod$innerType2 = _zod$innerType2._zod) === null || _zod$innerType2 === void 0 ? void 0 : _zod$innerType2.propValues;
		});
		defineLazyInternal(inst, "optin", (zod) => {
			var _zod$innerType$_zod$o, _zod$innerType3;
			return (_zod$innerType$_zod$o = (_zod$innerType3 = zod.innerType) === null || _zod$innerType3 === void 0 || (_zod$innerType3 = _zod$innerType3._zod) === null || _zod$innerType3 === void 0 ? void 0 : _zod$innerType3.optin) !== null && _zod$innerType$_zod$o !== void 0 ? _zod$innerType$_zod$o : void 0;
		});
		defineLazyInternal(inst, "optout", (zod) => {
			var _zod$innerType$_zod$o2, _zod$innerType4;
			return (_zod$innerType$_zod$o2 = (_zod$innerType4 = zod.innerType) === null || _zod$innerType4 === void 0 || (_zod$innerType4 = _zod$innerType4._zod) === null || _zod$innerType4 === void 0 ? void 0 : _zod$innerType4.optout) !== null && _zod$innerType$_zod$o2 !== void 0 ? _zod$innerType$_zod$o2 : void 0;
		});
		inst._zod.parse = (payload, ctx) => {
			return inst._zod.innerType._zod.run(payload, ctx);
		};
	});
	var $ZodCustom = /*@__PURE__*/ $constructor("$ZodCustom", (inst, def) => {
		$ZodCheck.init(inst, def);
		$ZodType.init(inst, def);
		inst._zod.parse = (payload, _) => {
			return payload;
		};
		inst._zod.check = (payload) => {
			const input = payload.value;
			const r = def.fn(input);
			if (r instanceof Promise) return r.then((r) => handleRefineResult(r, payload, input, inst));
			handleRefineResult(r, payload, input, inst);
		};
	});
	function handleRefineResult(result, payload, input, inst) {
		if (!result) {
			var _inst$_zod$def$path;
			const _iss = {
				code: "custom",
				input,
				inst,
				path: [...(_inst$_zod$def$path = inst._zod.def.path) !== null && _inst$_zod$def$path !== void 0 ? _inst$_zod$def$path : []],
				continue: !inst._zod.def.abort
			};
			if (inst._zod.def.params) _iss.params = inst._zod.def.params;
			payload.issues.push(issue(_iss));
		}
	}
	// node_modules/zod/v4/core/memoizer.js
	var $ZodCyclicError = class extends Error {
		constructor() {
			super(`Cannot parse a reference cycle that closes through a transform`);
			this.name = "ZodCyclicError";
		}
	};
	/** Keyed off the context object every schema in one parse call already shares. */
	var STATE = "~memo";
	var NO_ISSUES = [];
	function isRef(value) {
		return value !== null && typeof value === "object";
	}
	function cloneIssues(issues) {
		return issues.map((iss) => iss.path ? _objectSpread2(_objectSpread2({}, iss), {}, { path: iss.path.slice() }) : _objectSpread2({}, iss));
	}
	var recursive = /*@__PURE__*/ new WeakMap();
	/** What the walk established, in order of certainty: ordered so the strongest answer among children wins. */
	var NONE = 0;
	var ASSUMED = 1;
	var PROVEN = 2;
	/** Whether this schema's subtree contains a cycle, so one parse can re-enter it. */
	function isRecursive(inst, stack, resolve) {
		const cached = recursive.get(inst);
		if (cached !== void 0) return cached ? PROVEN : NONE;
		if (stack.has(inst)) return PROVEN;
		stack.add(inst);
		let result = NONE;
		const check = (child) => {
			if (result !== PROVEN && (child === null || child === void 0 ? void 0 : child._zod)) {
				const answer = isRecursive(child, stack, resolve);
				if (answer > result) result = answer;
			}
		};
		const shape = (sh, spread) => {
			let answer = NONE;
			for (const key of Reflect.ownKeys(sh)) {
				var _desc$value;
				const desc = Object.getOwnPropertyDescriptor(sh, key);
				if (spread && !desc.enumerable) continue;
				const child = desc.get ? ASSUMED : ((_desc$value = desc.value) === null || _desc$value === void 0 ? void 0 : _desc$value._zod) ? isRecursive(desc.value, stack, resolve) : NONE;
				if (child > answer) answer = child;
			}
			return answer;
		};
		const merge = (answer) => {
			if (answer > result) result = answer;
		};
		const def = inst._zod.def;
		switch (def.type) {
			case "object": {
				const raw = rawShape(def);
				merge(raw ? shape(raw, true) : ASSUMED);
				check(def.catchall);
				break;
			}
			case "array":
				check(def.element);
				break;
			case "tuple":
				for (const el of def.items) check(el);
				check(def.rest);
				break;
			case "record":
			case "map":
				check(def.keyType);
				check(def.valueType);
				break;
			case "set":
				check(def.valueType);
				break;
			case "union":
				for (const el of def.options) check(el);
				break;
			case "intersection":
				check(def.left);
				check(def.right);
				break;
			case "optional":
			case "nullable":
			case "default":
			case "prefault":
			case "catch":
			case "readonly":
			case "nonoptional":
			case "promise":
			case "success":
				check(def.innerType);
				break;
			case "pipe":
				check(def.in);
				check(def.out);
				break;
			case "function":
				check(def.input);
				check(def.output);
				break;
			case "lazy": {
				var _def$_cachedInner;
				const inner = (_def$_cachedInner = def._cachedInner) !== null && _def$_cachedInner !== void 0 ? _def$_cachedInner : resolve ? inst._zod.innerType : void 0;
				merge(inner ? isRecursive(inner, stack, false) : ASSUMED);
				break;
			}
			case "template_literal":
			case "string":
			case "number":
			case "int":
			case "boolean":
			case "bigint":
			case "symbol":
			case "undefined":
			case "null":
			case "void":
			case "never":
			case "any":
			case "unknown":
			case "date":
			case "nan":
			case "enum":
			case "literal":
			case "file":
			case "transform":
			case "custom": break;
			default: for (const key in def) {
				const desc = Object.getOwnPropertyDescriptor(def, key);
				if (!desc || desc.get) continue;
				const value = desc.value;
				if (!value || typeof value !== "object") continue;
				if (value._zod) check(value);
				else if (Array.isArray(value)) for (const el of value) check(el);
			}
		}
		stack.delete(inst);
		return settle(inst, result);
	}
	/** An assumed answer must not outlive the resolution that settles it, so only a certain one is cached. */
	function settle(inst, answer) {
		if (answer !== ASSUMED) recursive.set(inst, answer === PROVEN);
		return answer;
	}
	function bucketFor(state, inst) {
		let bucket = state.buckets.get(inst);
		if (!bucket) {
			bucket = /* @__PURE__ */ new WeakMap();
			state.buckets.set(inst, bucket);
		}
		return bucket;
	}
	var handoff;
	var open = [];
	var memo = {
		alloc(_inst, payload, empty) {
			const bucket = handoff;
			if (!bucket) return empty;
			handoff = void 0;
			const entry = {
				value: empty,
				issues: null
			};
			bucket.set(payload.value, entry);
			open.push(entry);
			return empty;
		},
		guard(inst) {
			var _a$deferred;
			var _a;
			(_a$deferred = (_a = inst._zod).deferred) !== null && _a$deferred !== void 0 || (_a.deferred = []);
			inst._zod.deferred.push(() => {
				const base = inst._zod.parse;
				const wrapped = (payload, ctx) => {
					if (ctx.direction !== "backward" && isBackEdge(ctx, payload.value)) throw new $ZodCyclicError();
					return base(payload, ctx);
				};
				inst._zod.parse = wrapped;
				if (inst._zod.run === base) inst._zod.run = wrapped;
			});
		},
		attach(inst) {
			var _a$deferred2;
			var _a;
			let isRecursiveInst;
			let rechecked = false;
			let lastCtx;
			let lastBucket;
			(_a$deferred2 = (_a = inst._zod).deferred) !== null && _a$deferred2 !== void 0 || (_a.deferred = []);
			inst._zod.deferred.push(() => {
				const base = inst._zod.parse;
				const wrapped = (payload, ctx) => {
					if (isRecursiveInst === void 0) {
						const walked = isRecursive(inst, /* @__PURE__ */ new Set(), false);
						if (walked === NONE) {
							inst._zod.parse = base;
							if (inst._zod.run === wrapped) inst._zod.run = base;
							return base(payload, ctx);
						}
						if (walked === PROVEN || rechecked) isRecursiveInst = true;
						else rechecked = true;
					}
					const input = payload.value;
					if (!isRef(input)) return base(payload, ctx);
					let state = ctx[STATE];
					if (!state) {
						state = {
							buckets: /* @__PURE__ */ new WeakMap(),
							backEdges: void 0
						};
						ctx[STATE] = state;
					}
					let bucket;
					if (lastCtx === ctx) bucket = lastBucket;
					else {
						bucket = bucketFor(state, inst);
						lastCtx = ctx;
						lastBucket = bucket;
					}
					const hit = bucket.get(input);
					if (hit) {
						payload.value = hit.value;
						if (hit.issues) {
							if (hit.issues.length) payload.issues.push(...cloneIssues(hit.issues));
						} else {
							var _state$backEdges;
							payload.memo = true;
							(_state$backEdges = state.backEdges) !== null && _state$backEdges !== void 0 || (state.backEdges = /* @__PURE__ */ new WeakSet());
							state.backEdges.add(hit.value);
						}
						return payload;
					}
					handoff = bucket;
					const depth = open.length;
					const result = base(payload, ctx);
					handoff = void 0;
					const entry = open.length > depth ? open.pop() : void 0;
					if (result instanceof Promise) return result.then((r) => {
						if (entry) entry.issues = r.issues.length ? cloneIssues(r.issues) : NO_ISSUES;
						return r;
					});
					if (entry) entry.issues = result.issues.length ? cloneIssues(result.issues) : NO_ISSUES;
					return result;
				};
				inst._zod.parse = wrapped;
				if (inst._zod.run === base) inst._zod.run = wrapped;
			});
		}
	};
	/** The memoizer that gives containers cycle support. `zod` installs it by default; `zod/mini` opts in with `config({ memoizer: memoizer() })`. */
	function memoizer() {
		return memo;
	}
	/** Whether this value is a node a back-edge resolved to before it finished. */
	function isBackEdge(ctx, value) {
		var _ctx$STATE;
		const backEdges = (_ctx$STATE = ctx[STATE]) === null || _ctx$STATE === void 0 ? void 0 : _ctx$STATE.backEdges;
		return backEdges !== void 0 && isRef(value) && backEdges.has(value);
	}
	// node_modules/zod/v4/locales/en.js
	var error = () => {
		const Sizable = {
			string: {
				unit: "characters",
				verb: "to have"
			},
			file: {
				unit: "bytes",
				verb: "to have"
			},
			array: {
				unit: "items",
				verb: "to have"
			},
			set: {
				unit: "items",
				verb: "to have"
			},
			map: {
				unit: "entries",
				verb: "to have"
			}
		};
		function getSizing(origin) {
			var _Sizable$origin;
			return (_Sizable$origin = Sizable[origin]) !== null && _Sizable$origin !== void 0 ? _Sizable$origin : null;
		}
		const FormatDictionary = {
			regex: "input",
			email: "email address",
			url: "URL",
			emoji: "emoji",
			uuid: "UUID",
			uuidv4: "UUIDv4",
			uuidv6: "UUIDv6",
			nanoid: "nanoid",
			guid: "GUID",
			cuid: "cuid",
			cuid2: "cuid2",
			ulid: "ULID",
			xid: "XID",
			ksuid: "KSUID",
			datetime: "ISO datetime",
			date: "ISO date",
			time: "ISO time",
			duration: "ISO duration",
			ipv4: "IPv4 address",
			ipv6: "IPv6 address",
			mac: "MAC address",
			cidrv4: "IPv4 range",
			cidrv6: "IPv6 range",
			base64: "base64-encoded string",
			base64url: "base64url-encoded string",
			json_string: "JSON string",
			e164: "E.164 number",
			currency_code: "currency code",
			credit_card: "credit card number",
			iban: "IBAN",
			jwt: "JWT",
			template_literal: "input"
		};
		const TypeDictionary = { nan: "NaN" };
		function getTypeName(type, input) {
			var _TypeDictionary$type;
			if (type === "number" && typeof input === "number" && !Number.isFinite(input)) return String(input);
			return (_TypeDictionary$type = TypeDictionary[type]) !== null && _TypeDictionary$type !== void 0 ? _TypeDictionary$type : type;
		}
		return (issue) => {
			switch (issue.code) {
				case "invalid_type": return `Invalid input: expected ${getTypeName(issue.expected)}, received ${getTypeName(parsedType(issue.input), issue.input)}`;
				case "invalid_value":
					if (issue.values.length === 1) return `Invalid input: expected ${stringifyPrimitive(issue.values[0])}`;
					return `Invalid option: expected one of ${joinValues(issue.values, "|")}`;
				case "too_big": {
					var _issue$origin, _sizing$unit, _issue$origin2;
					const adj = issue.exact ? "exactly " : issue.inclusive ? "<=" : "<";
					const sizing = getSizing(issue.origin);
					if (sizing) return `Too big: expected ${(_issue$origin = issue.origin) !== null && _issue$origin !== void 0 ? _issue$origin : "value"} to have ${adj}${issue.maximum.toString()} ${(_sizing$unit = sizing.unit) !== null && _sizing$unit !== void 0 ? _sizing$unit : "elements"}`;
					return `Too big: expected ${(_issue$origin2 = issue.origin) !== null && _issue$origin2 !== void 0 ? _issue$origin2 : "value"} to be ${adj}${issue.maximum.toString()}`;
				}
				case "too_small": {
					const adj = issue.exact ? "exactly " : issue.inclusive ? ">=" : ">";
					const sizing = getSizing(issue.origin);
					if (sizing) return `Too small: expected ${issue.origin} to have ${adj}${issue.minimum.toString()} ${sizing.unit}`;
					return `Too small: expected ${issue.origin} to be ${adj}${issue.minimum.toString()}`;
				}
				case "invalid_format": {
					var _FormatDictionary$_is;
					const _issue = issue;
					if (_issue.format === "starts_with") return `Invalid string: must start with "${_issue.prefix}"`;
					if (_issue.format === "ends_with") return `Invalid string: must end with "${_issue.suffix}"`;
					if (_issue.format === "includes") return `Invalid string: must include "${_issue.includes}"`;
					if (_issue.format === "regex") return `Invalid string: must match pattern ${_issue.pattern}`;
					return `Invalid ${(_FormatDictionary$_is = FormatDictionary[_issue.format]) !== null && _FormatDictionary$_is !== void 0 ? _FormatDictionary$_is : issue.format}`;
				}
				case "not_multiple_of": return `Invalid number: must be a multiple of ${issue.divisor}`;
				case "unrecognized_keys": return `Unrecognized key${issue.keys.length > 1 ? "s" : ""}: ${joinValues(issue.keys, ", ")}`;
				case "invalid_key": return `Invalid key in ${issue.origin}`;
				case "invalid_union":
					if (issue.options && Array.isArray(issue.options) && issue.options.length > 0) return `Invalid discriminator value. Expected ${issue.options.map((o) => `'${o}'`).join(" | ")}`;
					if (issue.inclusive === false) return "Invalid input: more than one option matched";
					return "Invalid input";
				case "invalid_element": return `Invalid value in ${issue.origin}`;
				default: return `Invalid input`;
			}
		};
	};
	function en_default() {
		return { localeError: error() };
	}
	// node_modules/zod/v4/core/registries.js
	var _a$__zod_globalRegist;
	var _a;
	var $ZodRegistry = class {
		constructor() {
			this._map = /* @__PURE__ */ new WeakMap();
			this._idmap = /* @__PURE__ */ new Map();
		}
		add(schema, ..._meta) {
			const meta = _meta[0];
			this._map.set(schema, meta);
			if (meta && typeof meta === "object" && "id" in meta) this._idmap.set(meta.id, schema);
			return this;
		}
		clear() {
			this._map = /* @__PURE__ */ new WeakMap();
			this._idmap = /* @__PURE__ */ new Map();
			return this;
		}
		remove(schema) {
			const meta = this._map.get(schema);
			if (meta && typeof meta === "object" && "id" in meta) this._idmap.delete(meta.id);
			this._map.delete(schema);
			return this;
		}
		get(schema) {
			const p = schema._zod.parent;
			if (p) {
				var _this$get;
				const pm = _objectSpread2({}, (_this$get = this.get(p)) !== null && _this$get !== void 0 ? _this$get : {});
				delete pm.id;
				const f = _objectSpread2(_objectSpread2({}, pm), this._map.get(schema));
				return Object.keys(f).length ? f : void 0;
			}
			return this._map.get(schema);
		}
		has(schema) {
			return this._map.has(schema);
		}
	};
	function registry() {
		return new $ZodRegistry();
	}
	(_a$__zod_globalRegist = (_a = globalThis).__zod_globalRegistry) !== null && _a$__zod_globalRegist !== void 0 || (_a.__zod_globalRegistry = registry());
	var globalRegistry = globalThis.__zod_globalRegistry;
	// node_modules/zod/v4/core/api.js
	function snapshotChecks(def) {
		if (def.checks) def.checks = [...def.checks];
		return def;
	}
	// @__NO_SIDE_EFFECTS__
	function _string(Class, params) {
		return new Class(snapshotChecks(_objectSpread2({ type: "string" }, normalizeParams(params))));
	}
	// @__NO_SIDE_EFFECTS__
	function _email(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "email",
			check: "string_format",
			abort: false
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _guid(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "guid",
			check: "string_format",
			abort: false
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _uuid(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "uuid",
			check: "string_format",
			abort: false
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _uuidv4(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "uuid",
			check: "string_format",
			abort: false,
			version: "v4"
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _uuidv6(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "uuid",
			check: "string_format",
			abort: false,
			version: "v6"
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _uuidv7(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "uuid",
			check: "string_format",
			abort: false,
			version: "v7"
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _url(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "url",
			check: "string_format",
			abort: false
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _emoji(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "emoji",
			check: "string_format",
			abort: false
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _nanoid(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "nanoid",
			check: "string_format",
			abort: false
		}, normalizeParams(params)));
	}
	/**
	* @deprecated CUID v1 is deprecated by its authors due to information leakage
	* (timestamps embedded in the id). Use {@link _cuid2} instead.
	* See https://github.com/paralleldrive/cuid.
	*/
	// @__NO_SIDE_EFFECTS__
	function _cuid(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "cuid",
			check: "string_format",
			abort: false
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _cuid2(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "cuid2",
			check: "string_format",
			abort: false
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _ulid(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "ulid",
			check: "string_format",
			abort: false
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _xid(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "xid",
			check: "string_format",
			abort: false
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _ksuid(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "ksuid",
			check: "string_format",
			abort: false
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _ipv4(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "ipv4",
			check: "string_format",
			abort: false
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _ipv6(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "ipv6",
			check: "string_format",
			abort: false
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _cidrv4(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "cidrv4",
			check: "string_format",
			abort: false
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _cidrv6(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "cidrv6",
			check: "string_format",
			abort: false
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _base64(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "base64",
			check: "string_format",
			abort: false
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _base64url(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "base64url",
			check: "string_format",
			abort: false
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _e164(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "e164",
			check: "string_format",
			abort: false
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _jwt(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "jwt",
			check: "string_format",
			abort: false
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _isoDateTime(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "datetime",
			check: "string_format",
			offset: false,
			local: false,
			precision: null
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _isoDate(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "date",
			check: "string_format"
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _isoTime(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "time",
			check: "string_format",
			precision: null
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _isoDuration(Class, params) {
		return new Class(_objectSpread2({
			type: "string",
			format: "duration",
			check: "string_format"
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _number(Class, params) {
		return new Class(snapshotChecks(_objectSpread2({
			type: "number",
			checks: []
		}, normalizeParams(params))));
	}
	// @__NO_SIDE_EFFECTS__
	function _int(Class, params) {
		return new Class(_objectSpread2({
			type: "number",
			check: "number_format",
			abort: false,
			format: "safeint"
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _boolean(Class, params) {
		return new Class(_objectSpread2({ type: "boolean" }, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _unknown(Class) {
		return new Class({ type: "unknown" });
	}
	// @__NO_SIDE_EFFECTS__
	function _never(Class, params) {
		return new Class(_objectSpread2({ type: "never" }, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _lt(value, params) {
		return new $ZodCheckLessThan(_objectSpread2(_objectSpread2({ check: "less_than" }, normalizeParams(params)), {}, {
			value,
			inclusive: false
		}));
	}
	// @__NO_SIDE_EFFECTS__
	function _lte(value, params) {
		return new $ZodCheckLessThan(_objectSpread2(_objectSpread2({ check: "less_than" }, normalizeParams(params)), {}, {
			value,
			inclusive: true
		}));
	}
	// @__NO_SIDE_EFFECTS__
	function _gt(value, params) {
		return new $ZodCheckGreaterThan(_objectSpread2(_objectSpread2({ check: "greater_than" }, normalizeParams(params)), {}, {
			value,
			inclusive: false
		}));
	}
	// @__NO_SIDE_EFFECTS__
	function _gte(value, params) {
		return new $ZodCheckGreaterThan(_objectSpread2(_objectSpread2({ check: "greater_than" }, normalizeParams(params)), {}, {
			value,
			inclusive: true
		}));
	}
	// @__NO_SIDE_EFFECTS__
	function _multipleOf(value, params) {
		return new $ZodCheckMultipleOf(_objectSpread2(_objectSpread2({ check: "multiple_of" }, normalizeParams(params)), {}, { value }));
	}
	// @__NO_SIDE_EFFECTS__
	function _maxLength(maximum, params) {
		return new $ZodCheckMaxLength(_objectSpread2(_objectSpread2({ check: "max_length" }, normalizeParams(params)), {}, { maximum }));
	}
	// @__NO_SIDE_EFFECTS__
	function _minLength(minimum, params) {
		return new $ZodCheckMinLength(_objectSpread2(_objectSpread2({ check: "min_length" }, normalizeParams(params)), {}, { minimum }));
	}
	// @__NO_SIDE_EFFECTS__
	function _length(length, params) {
		return new $ZodCheckLengthEquals(_objectSpread2(_objectSpread2({ check: "length_equals" }, normalizeParams(params)), {}, { length }));
	}
	// @__NO_SIDE_EFFECTS__
	function _regex(pattern, params) {
		return new $ZodCheckRegex(_objectSpread2(_objectSpread2({
			check: "string_format",
			format: "regex"
		}, normalizeParams(params)), {}, { pattern }));
	}
	// @__NO_SIDE_EFFECTS__
	function _lowercase(params) {
		return new $ZodCheckLowerCase(_objectSpread2({
			check: "string_format",
			format: "lowercase"
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _uppercase(params) {
		return new $ZodCheckUpperCase(_objectSpread2({
			check: "string_format",
			format: "uppercase"
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _includes(includes, params) {
		return new $ZodCheckIncludes(_objectSpread2(_objectSpread2({
			check: "string_format",
			format: "includes"
		}, normalizeParams(params)), {}, { includes }));
	}
	// @__NO_SIDE_EFFECTS__
	function _startsWith(prefix, params) {
		return new $ZodCheckStartsWith(_objectSpread2(_objectSpread2({
			check: "string_format",
			format: "starts_with"
		}, normalizeParams(params)), {}, { prefix }));
	}
	// @__NO_SIDE_EFFECTS__
	function _endsWith(suffix, params) {
		return new $ZodCheckEndsWith(_objectSpread2(_objectSpread2({
			check: "string_format",
			format: "ends_with"
		}, normalizeParams(params)), {}, { suffix }));
	}
	// @__NO_SIDE_EFFECTS__
	function _overwrite(tx) {
		return new $ZodCheckOverwrite({
			check: "overwrite",
			tx
		});
	}
	// @__NO_SIDE_EFFECTS__
	function _normalize(form) {
		return /* @__PURE__ */ _overwrite((input) => input.normalize(form));
	}
	// @__NO_SIDE_EFFECTS__
	function _trim() {
		return /* @__PURE__ */ _overwrite((input) => input.trim());
	}
	// @__NO_SIDE_EFFECTS__
	function _toLowerCase() {
		return /* @__PURE__ */ _overwrite((input) => input.toLowerCase());
	}
	// @__NO_SIDE_EFFECTS__
	function _toUpperCase() {
		return /* @__PURE__ */ _overwrite((input) => input.toUpperCase());
	}
	// @__NO_SIDE_EFFECTS__
	function _slugify() {
		return /* @__PURE__ */ _overwrite((input) => slugify(input));
	}
	// @__NO_SIDE_EFFECTS__
	function _array(Class, element, params) {
		return new Class(_objectSpread2({
			type: "array",
			element
		}, normalizeParams(params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _refine(Class, fn, _params) {
		return new Class(_objectSpread2({
			type: "custom",
			check: "custom",
			fn
		}, normalizeParams(_params)));
	}
	// @__NO_SIDE_EFFECTS__
	function _superRefine(fn, params) {
		const ch = /* @__PURE__ */ _check((payload) => {
			payload.addIssue = (issue$2) => {
				if (typeof issue$2 === "string") payload.issues.push(issue(issue$2, payload.value, ch._zod.def));
				else {
					var _issue$code, _issue$inst, _issue$continue;
					const _issue = issue$2;
					if (_issue.fatal) _issue.continue = false;
					(_issue$code = _issue.code) !== null && _issue$code !== void 0 || (_issue.code = "custom");
					if (!("input" in _issue)) _issue.input = payload.value;
					(_issue$inst = _issue.inst) !== null && _issue$inst !== void 0 || (_issue.inst = ch);
					(_issue$continue = _issue.continue) !== null && _issue$continue !== void 0 || (_issue.continue = !ch._zod.def.abort);
					payload.issues.push(issue(_issue));
				}
			};
			return fn(payload.value, payload);
		}, params);
		return ch;
	}
	// @__NO_SIDE_EFFECTS__
	function _check(fn, params) {
		const ch = new $ZodCheck(_objectSpread2({ check: "custom" }, normalizeParams(params)));
		ch._zod.check = fn;
		return ch;
	}
	// node_modules/zod/v4/core/to-json-schema.js
	function assignProps(target, ...sources) {
		for (const source of sources) for (const key of Reflect.ownKeys(source)) if (Object.prototype.propertyIsEnumerable.call(source, key)) assignProp(target, key, source[key]);
		return target;
	}
	function initializeContext(params) {
		var _params$target, _params$processors, _params$metadata, _params$unrepresentab, _params$override, _params$io, _params$cycles, _params$reused, _params$external;
		let target = (_params$target = params === null || params === void 0 ? void 0 : params.target) !== null && _params$target !== void 0 ? _params$target : "draft-2020-12";
		if (target === "draft-4") target = "draft-04";
		if (target === "draft-7") target = "draft-07";
		return {
			processors: (_params$processors = params.processors) !== null && _params$processors !== void 0 ? _params$processors : {},
			metadataRegistry: (_params$metadata = params === null || params === void 0 ? void 0 : params.metadata) !== null && _params$metadata !== void 0 ? _params$metadata : globalRegistry,
			target,
			unrepresentable: (_params$unrepresentab = params === null || params === void 0 ? void 0 : params.unrepresentable) !== null && _params$unrepresentab !== void 0 ? _params$unrepresentab : "throw",
			override: (_params$override = params === null || params === void 0 ? void 0 : params.override) !== null && _params$override !== void 0 ? _params$override : (() => {}),
			io: (_params$io = params === null || params === void 0 ? void 0 : params.io) !== null && _params$io !== void 0 ? _params$io : "output",
			counter: 0,
			seen: /* @__PURE__ */ new Map(),
			sharedDefsExtractedFor: void 0,
			sharedEmitDoneFor: void 0,
			cycles: (_params$cycles = params === null || params === void 0 ? void 0 : params.cycles) !== null && _params$cycles !== void 0 ? _params$cycles : "ref",
			reused: (_params$reused = params === null || params === void 0 ? void 0 : params.reused) !== null && _params$reused !== void 0 ? _params$reused : "inline",
			intersections: [],
			deferred: [],
			external: (_params$external = params === null || params === void 0 ? void 0 : params.external) !== null && _params$external !== void 0 ? _params$external : void 0
		};
	}
	/**
	* Applies the `unrepresentable` setting at a site that has no JSON Schema equivalent. Throws
	* `message` unless the setting (or the handler's return value) says otherwise. Returns `true` if a
	* custom JSON Schema was written into `json`, in which case the caller must not write its own.
	*/
	function handleUnrepresentable(schema, ctx, json, params, message) {
		const result = typeof ctx.unrepresentable === "function" ? ctx.unrepresentable({
			zodSchema: schema,
			path: params.path,
			message
		}) : ctx.unrepresentable;
		if (result === "any") return false;
		if (result === void 0 || result === "throw") throw new Error(message);
		Object.assign(json, result);
		return true;
	}
	function processSchema(schema, ctx, _params = {
		path: [],
		schemaPath: []
	}) {
		var _schema$_zod$toJSONSc, _schema$_zod, _a$default;
		var _a;
		const def = schema._zod.def;
		const seen = ctx.seen.get(schema);
		if (seen) {
			seen.count++;
			if (_params.schemaPath.includes(schema)) seen.cycle = _params.path;
			return seen.schema;
		}
		const result = {
			schema: {},
			count: 1,
			cycle: void 0,
			path: _params.path
		};
		ctx.seen.set(schema, result);
		ctx.sharedDefsExtractedFor = void 0;
		ctx.sharedEmitDoneFor = void 0;
		const overrideSchema = (_schema$_zod$toJSONSc = (_schema$_zod = schema._zod).toJSONSchema) === null || _schema$_zod$toJSONSc === void 0 ? void 0 : _schema$_zod$toJSONSc.call(_schema$_zod);
		if (overrideSchema) result.schema = overrideSchema;
		else {
			const params = _objectSpread2(_objectSpread2({}, _params), {}, {
				schemaPath: [..._params.schemaPath, schema],
				path: _params.path
			});
			if (schema._zod.processJSONSchema) schema._zod.processJSONSchema(ctx, result.schema, params);
			else {
				const _json = result.schema;
				const processor = ctx.processors[def.type];
				if (!processor) throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
				processor(schema, ctx, _json, params);
			}
			const parent = schema._zod.parent;
			if (parent) {
				if (!result.ref) result.ref = parent;
				processSchema(parent, ctx, params);
				ctx.seen.get(parent).isParent = true;
			}
		}
		const meta = ctx.metadataRegistry.get(schema);
		if (meta) assignProps(result.schema, meta);
		if (ctx.io === "input" && isTransforming(schema)) {
			delete result.schema.examples;
			delete result.schema.default;
		}
		if (ctx.io === "input" && "_prefault" in result.schema) (_a$default = (_a = result.schema).default) !== null && _a$default !== void 0 || (_a.default = result.schema._prefault);
		delete result.schema._prefault;
		return ctx.seen.get(schema).schema;
	}
	function encodeJSONPointerSegment(segment) {
		return segment.replace(/~/g, "~0").replace(/\//g, "~1");
	}
	function extractDefs(ctx, schema) {
		const root = ctx.seen.get(schema);
		if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
		if (ctx.external && ctx.sharedDefsExtractedFor === ctx.external) return;
		const idToSchema = /* @__PURE__ */ new Map();
		for (const entry of ctx.seen.entries()) {
			var _ctx$metadataRegistry;
			const id = (_ctx$metadataRegistry = ctx.metadataRegistry.get(entry[0])) === null || _ctx$metadataRegistry === void 0 ? void 0 : _ctx$metadataRegistry.id;
			if (id) {
				const existing = idToSchema.get(id);
				if (existing && existing !== entry[0]) throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
				idToSchema.set(id, entry[0]);
			}
		}
		const makeURI = (entry) => {
			var _entry$1$schema$id;
			const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
			if (ctx.external) {
				var _ctx$external$registr, _ctx$external$uri, _ref, _entry$1$defId;
				const externalId = (_ctx$external$registr = ctx.external.registry.get(entry[0])) === null || _ctx$external$registr === void 0 ? void 0 : _ctx$external$registr.id;
				const uriGenerator = (_ctx$external$uri = ctx.external.uri) !== null && _ctx$external$uri !== void 0 ? _ctx$external$uri : ((id) => id);
				if (externalId) return { ref: uriGenerator(externalId) };
				const id = (_ref = (_entry$1$defId = entry[1].defId) !== null && _entry$1$defId !== void 0 ? _entry$1$defId : entry[1].schema.id) !== null && _ref !== void 0 ? _ref : `schema${ctx.counter++}`;
				entry[1].defId = id;
				return {
					defId: id,
					ref: `${uriGenerator("__shared")}#/${defsSegment}/${encodeJSONPointerSegment(id)}`
				};
			}
			const uriPrefix = `#`;
			const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
			if (entry[1] === root && !entry[1].schema.id) return { ref: uriPrefix };
			const defId = (_entry$1$schema$id = entry[1].schema.id) !== null && _entry$1$schema$id !== void 0 ? _entry$1$schema$id : `__schema${ctx.counter++}`;
			return {
				defId,
				ref: defUriPrefix + encodeJSONPointerSegment(defId)
			};
		};
		const extractToDef = (entry) => {
			if (entry[1].schema.$ref) return;
			const seen = entry[1];
			const { ref, defId } = makeURI(entry);
			seen.def = _objectSpread2({}, seen.schema);
			if (defId) seen.defId = defId;
			const schema = seen.schema;
			for (const key in schema) delete schema[key];
			schema.$ref = ref;
		};
		if (ctx.cycles === "throw") for (const entry of ctx.seen.entries()) {
			const seen = entry[1];
			if (seen.cycle) {
				var _seen$cycle;
				throw new Error(`Cycle detected: #/${(_seen$cycle = seen.cycle) === null || _seen$cycle === void 0 ? void 0 : _seen$cycle.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
			}
		}
		for (const entry of ctx.seen.entries()) {
			var _ctx$metadataRegistry2;
			const seen = entry[1];
			if (schema === entry[0]) {
				extractToDef(entry);
				continue;
			}
			if (ctx.external) {
				var _ctx$external$registr2;
				const ext = (_ctx$external$registr2 = ctx.external.registry.get(entry[0])) === null || _ctx$external$registr2 === void 0 ? void 0 : _ctx$external$registr2.id;
				if (schema !== entry[0] && ext) {
					extractToDef(entry);
					continue;
				}
			}
			if ((_ctx$metadataRegistry2 = ctx.metadataRegistry.get(entry[0])) === null || _ctx$metadataRegistry2 === void 0 ? void 0 : _ctx$metadataRegistry2.id) {
				extractToDef(entry);
				continue;
			}
			if (seen.cycle) {
				extractToDef(entry);
				continue;
			}
			if (seen.count > 1) {
				if (ctx.reused === "ref") extractToDef(entry);
			}
		}
		if (ctx.external) ctx.sharedDefsExtractedFor = ctx.external;
	}
	/** Rewrites `anyOf: [{type: "a"}, {type: "b"}]` to `type: ["a", "b"]`, which every JSON Schema draft treats as equivalent and most consumers render far better for the nullable case. Only branches that are a bare type assertion qualify — anything carrying a constraint, `$ref`, `const` or metadata is left alone. Runs after `flattenRef`, so a branch an override decorated or `$defs` extraction turned into a `$ref` is no longer bare and correctly stays in `anyOf`. `oneOf` is excluded: `integer` and `number` overlap, so "exactly one" and "at least one" are not the same there. OpenAPI 3.0 is excluded: its `type` must be a single string. */
	function compactTypeUnion(schema) {
		const options = schema.anyOf;
		if (!Array.isArray(options) || options.length === 0 || schema.type !== void 0) return;
		const types = [];
		for (const option of options) {
			if (!option || typeof option !== "object") return;
			compactTypeUnion(option);
			const keys = Object.keys(option);
			if (keys.length !== 1 || keys[0] !== "type") return;
			const type = option.type;
			for (const member of Array.isArray(type) ? type : [type]) {
				if (typeof member !== "string") return;
				if (!types.includes(member)) types.push(member);
			}
		}
		delete schema.anyOf;
		schema.type = types.length === 1 ? types[0] : types;
	}
	/** Keywords `foldIntersection` knows how to combine. Anything else — `$ref`, `patternProperties`,
	* an annotation like `description` — makes a member unfoldable, so a constraint this does not
	* understand leaves the `allOf` alone instead of being silently dropped or misattributed. */
	var FOLDABLE_KEYS = /* @__PURE__ */ new Set([
		"type",
		"properties",
		"required",
		"additionalProperties"
	]);
	var UNION_KEYS = ["oneOf", "anyOf"];
	/** A member's constraint on a key it does not declare itself. A `catchall` states one; `false`, an absent `additionalProperties`, and the empty schema a loose object emits state nothing. */
	function undeclaredConstraint(member) {
		const extra = member.additionalProperties;
		if (extra === void 0 || extra === false || typeof extra !== "object" || extra === null) return null;
		return Object.keys(extra).length ? extra : null;
	}
	/** Combines object members into the single object they describe together, or returns `null` if any of them carries a keyword outside {@link FOLDABLE_KEYS}. */
	function foldObjects(members) {
		const objects = [];
		for (const member of members) {
			if (typeof member !== "object" || member.type !== "object") return null;
			for (const key in member) if (!FOLDABLE_KEYS.has(key)) return null;
			objects.push(member);
		}
		const properties = {};
		const required = /* @__PURE__ */ new Set();
		for (const object of objects) {
			var _object$required;
			for (const key in object.properties) {
				var _foldObjects;
				if (Object.prototype.hasOwnProperty.call(properties, key)) continue;
				const parts = [];
				for (const other of objects) {
					var _other$properties$key, _other$properties;
					const part = (_other$properties$key = (_other$properties = other.properties) === null || _other$properties === void 0 ? void 0 : _other$properties[key]) !== null && _other$properties$key !== void 0 ? _other$properties$key : undeclaredConstraint(other);
					if (part === null || part === void 0) continue;
					if (!parts.some((seen) => JSON.stringify(seen) === JSON.stringify(part))) parts.push(part);
				}
				assignProp(properties, key, parts.length === 1 ? parts[0] : (_foldObjects = foldObjects(parts)) !== null && _foldObjects !== void 0 ? _foldObjects : { allOf: parts });
			}
			for (const key of (_object$required = object.required) !== null && _object$required !== void 0 ? _object$required : []) required.add(key);
		}
		const folded = {
			type: "object",
			properties
		};
		if (required.size) folded.required = [...required];
		if (objects.every((object) => object.additionalProperties === false)) folded.additionalProperties = false;
		else {
			const constraints = [];
			for (const object of objects) {
				const constraint = undeclaredConstraint(object);
				if (constraint && !constraints.some((seen) => JSON.stringify(seen) === JSON.stringify(constraint))) constraints.push(constraint);
			}
			if (constraints.length === 1) folded.additionalProperties = constraints[0];
			else if (constraints.length > 1) folded.additionalProperties = { allOf: constraints };
		}
		return folded;
	}
	/** `additionalProperties` in an `allOf` member sees only that member's own `properties`, so two
	* closed object members reject each other's keys and the schema validates nothing. Zod's parser
	* pools the key sets instead — `handleIntersectionResults` reports a key as unrecognized only when
	* *every* side rejects it — so the emitted schema has to pool them too, and folding the members
	* into one object is the encoding that says so on every target.
	*
	* This runs from `finalize`, after `extractDefs`, which is what keeps it clear of the `$ref`
	* machinery: a member extracted into `$defs` is already a `$ref` by now and declines to fold, so it
	* keeps its reference and its own closedness rather than being inlined as a stale copy. */
	function foldIntersection(json) {
		const allOf = json.allOf;
		if (!Array.isArray(allOf) || allOf.length < 2) return;
		for (const key of FOLDABLE_KEYS) if (key in json) return;
		const unions = allOf.filter((m) => UNION_KEYS.some((k) => Array.isArray(m[k])));
		let folded = null;
		if (!unions.length) folded = foldObjects(allOf);
		else {
			const union = unions[0];
			const keyword = UNION_KEYS.find((k) => Array.isArray(union[k]));
			if (Object.keys(union).length !== 1) return;
			const rest = allOf.filter((m) => m !== union);
			const branches = union[keyword].map((branch) => foldObjects([...rest, branch]));
			if (branches.some((b) => !b)) return;
			folded = { [keyword]: branches };
		}
		if (!folded) return;
		delete json.allOf;
		assignProps(json, folded);
	}
	function finalize(ctx, schema) {
		var _ctx$external, _root$def, _ctx$metadataRegistry3, _ctx$external$defs, _ctx$external2;
		const root = ctx.seen.get(schema);
		if (!root) throw new Error("Unprocessed schema. This is a bug in Zod.");
		const flattenRef = (zodSchema) => {
			var _seen$def, _seen$path;
			const seen = ctx.seen.get(zodSchema);
			if (seen.ref === null) return;
			const schema = (_seen$def = seen.def) !== null && _seen$def !== void 0 ? _seen$def : seen.schema;
			const _cached = _objectSpread2({}, schema);
			const ref = seen.ref;
			seen.ref = null;
			if (ref) {
				flattenRef(ref);
				const refSeen = ctx.seen.get(ref);
				const refSchema = refSeen.schema;
				if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
					var _schema$allOf;
					schema.allOf = (_schema$allOf = schema.allOf) !== null && _schema$allOf !== void 0 ? _schema$allOf : [];
					schema.allOf.push(refSchema);
				} else assignProps(schema, refSchema);
				assignProps(schema, _cached);
				if (zodSchema._zod.parent === ref) for (const key in schema) {
					if (key === "$ref" || key === "allOf") continue;
					if (!(key in _cached)) delete schema[key];
				}
				if (refSchema.$ref && refSeen.def) for (const key in schema) {
					if (key === "$ref" || key === "allOf") continue;
					if (key in refSeen.def && JSON.stringify(schema[key]) === JSON.stringify(refSeen.def[key])) delete schema[key];
				}
			}
			const parent = zodSchema._zod.parent;
			if (parent && parent !== ref) {
				flattenRef(parent);
				const parentSeen = ctx.seen.get(parent);
				if (parentSeen === null || parentSeen === void 0 ? void 0 : parentSeen.schema.$ref) {
					schema.$ref = parentSeen.schema.$ref;
					if (parentSeen.def) for (const key in schema) {
						if (key === "$ref" || key === "allOf") continue;
						if (key in parentSeen.def && JSON.stringify(schema[key]) === JSON.stringify(parentSeen.def[key])) delete schema[key];
					}
				}
			}
			ctx.override({
				zodSchema,
				jsonSchema: schema,
				path: (_seen$path = seen.path) !== null && _seen$path !== void 0 ? _seen$path : []
			});
		};
		if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) {
			for (const entry of [...ctx.seen.entries()].reverse()) flattenRef(entry[0]);
			if (ctx.target !== "openapi-3.0") for (const entry of ctx.seen.entries()) {
				var _entry$1$def;
				compactTypeUnion((_entry$1$def = entry[1].def) !== null && _entry$1$def !== void 0 ? _entry$1$def : entry[1].schema);
			}
			for (const rewrite of ctx.deferred) rewrite();
			if (ctx.intersections.length) {
				const carriers = /* @__PURE__ */ new Map();
				for (const seen of ctx.seen.values()) for (const json of [seen.schema, seen.def]) {
					const allOf = json === null || json === void 0 ? void 0 : json.allOf;
					if (!Array.isArray(allOf)) continue;
					const existing = carriers.get(allOf);
					if (existing) existing.push(json);
					else carriers.set(allOf, [json]);
				}
				for (const allOf of ctx.intersections) {
					var _carriers$get;
					for (const json of (_carriers$get = carriers.get(allOf)) !== null && _carriers$get !== void 0 ? _carriers$get : []) foldIntersection(json);
				}
			}
		}
		const result = {};
		if (ctx.target === "draft-2020-12") result.$schema = "https://json-schema.org/draft/2020-12/schema";
		else if (ctx.target === "draft-07") result.$schema = "http://json-schema.org/draft-07/schema#";
		else if (ctx.target === "draft-04") result.$schema = "http://json-schema.org/draft-04/schema#";
		else if (ctx.target === "openapi-3.0") {}
		if ((_ctx$external = ctx.external) === null || _ctx$external === void 0 ? void 0 : _ctx$external.uri) {
			var _ctx$external$registr3;
			const id = (_ctx$external$registr3 = ctx.external.registry.get(schema)) === null || _ctx$external$registr3 === void 0 ? void 0 : _ctx$external$registr3.id;
			if (!id) throw new Error("Schema is missing an `id` property");
			result.$id = ctx.external.uri(id);
		}
		assignProps(result, root.defId ? root.schema : (_root$def = root.def) !== null && _root$def !== void 0 ? _root$def : root.schema);
		const rootMetaId = (_ctx$metadataRegistry3 = ctx.metadataRegistry.get(schema)) === null || _ctx$metadataRegistry3 === void 0 ? void 0 : _ctx$metadataRegistry3.id;
		if (rootMetaId !== void 0 && result.id === rootMetaId) delete result.id;
		const defs = (_ctx$external$defs = (_ctx$external2 = ctx.external) === null || _ctx$external2 === void 0 ? void 0 : _ctx$external2.defs) !== null && _ctx$external$defs !== void 0 ? _ctx$external$defs : {};
		if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) for (const entry of ctx.seen.entries()) {
			const seen = entry[1];
			if (seen.def && seen.defId) {
				if (seen.def.id === seen.defId) delete seen.def.id;
				assignProp(defs, seen.defId, seen.def);
			}
		}
		if (ctx.external) ctx.sharedEmitDoneFor = ctx.external;
		if (ctx.external) {} else if (Object.keys(defs).length > 0) {
			if (ctx.target === "draft-2020-12") result.$defs = defs;
			else result.definitions = defs;
		}
		try {
			const finalized = JSON.parse(JSON.stringify(result));
			Object.defineProperty(finalized, "~standard", {
				value: _objectSpread2(_objectSpread2({}, schema["~standard"]), {}, { jsonSchema: {
					input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
					output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
				} }),
				enumerable: false,
				writable: false
			});
			return finalized;
		} catch (_err) {
			throw new Error("Error converting schema to JSON.");
		}
	}
	function isTransforming(_schema, _ctx) {
		const ctx = _ctx !== null && _ctx !== void 0 ? _ctx : { seen: /* @__PURE__ */ new Set() };
		if (ctx.seen.has(_schema)) return false;
		ctx.seen.add(_schema);
		const def = _schema._zod.def;
		if (def.type === "transform") return true;
		if (def.type === "array") return isTransforming(def.element, ctx);
		if (def.type === "set") return isTransforming(def.valueType, ctx);
		if (def.type === "lazy") return isTransforming(def.getter(), ctx);
		if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault" || def.type === "catch") return isTransforming(def.innerType, ctx);
		if (def.type === "intersection") return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
		if (def.type === "record" || def.type === "map") return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
		if (def.type === "pipe") {
			if (_schema._zod.traits.has("$ZodCodec")) return true;
			return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
		}
		if (def.type === "object") {
			for (const key in def.shape) if (isTransforming(def.shape[key], ctx)) return true;
			return false;
		}
		if (def.type === "union") {
			for (const option of def.options) if (isTransforming(option, ctx)) return true;
			return false;
		}
		if (def.type === "tuple") {
			for (const item of def.items) if (isTransforming(item, ctx)) return true;
			if (def.rest && isTransforming(def.rest, ctx)) return true;
			return false;
		}
		return false;
	}
	/**
	* Creates a toJSONSchema method for a schema instance.
	* This encapsulates the logic of initializing context, processing, extracting defs, and finalizing.
	*/
	var createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
		const ctx = initializeContext(_objectSpread2(_objectSpread2({}, params), {}, { processors }));
		processSchema(schema, ctx);
		extractDefs(ctx, schema);
		return finalize(ctx, schema);
	};
	var createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
		const { libraryOptions, target } = params !== null && params !== void 0 ? params : {};
		const ctx = initializeContext(_objectSpread2(_objectSpread2({}, libraryOptions !== null && libraryOptions !== void 0 ? libraryOptions : {}), {}, {
			target,
			io,
			processors
		}));
		processSchema(schema, ctx);
		extractDefs(ctx, schema);
		return finalize(ctx, schema);
	};
	// \0@oxc-project+runtime@0.155.0/helpers/esm/objectWithoutPropertiesLoose.js
	function _objectWithoutPropertiesLoose(r, e) {
		if (null == r) return {};
		var t = {};
		for (var n in r) if ({}.hasOwnProperty.call(r, n)) {
			if (e.includes(n)) continue;
			t[n] = r[n];
		}
		return t;
	}
	// \0@oxc-project+runtime@0.155.0/helpers/esm/objectWithoutProperties.js
	function _objectWithoutProperties(e, t) {
		if (null == e) return {};
		var o, r, i = _objectWithoutPropertiesLoose(e, t);
		if (Object.getOwnPropertySymbols) {
			var s = Object.getOwnPropertySymbols(e);
			for (r = 0; r < s.length; r++) o = s[r], t.includes(o) || {}.propertyIsEnumerable.call(e, o) && (i[o] = e[o]);
		}
		return i;
	}
	// node_modules/zod/v4/core/json-schema-processors.js
	var _excluded = [
		"minimum",
		"maximum",
		"exclusiveMinimum",
		"exclusiveMaximum",
		"multipleOf",
		"format",
		"id"
	];
	var narrowMin = (agg, key, value) => {
		if (agg[key] === void 0 || value > agg[key]) agg[key] = value;
	};
	var narrowMax = (agg, key, value) => {
		if (agg[key] === void 0 || value < agg[key]) agg[key] = value;
	};
	var narrowBoth = (agg, value) => {
		narrowMin(agg, "minimum", value);
		narrowMax(agg, "maximum", value);
	};
	var addDivisor = (agg, value) => {
		var _agg$multipleOf;
		(_agg$multipleOf = agg.multipleOf) !== null && _agg$multipleOf !== void 0 || (agg.multipleOf = []);
		if (!agg.multipleOf.includes(value)) agg.multipleOf.push(value);
	};
	var addPattern = (agg, pattern) => {
		var _agg$patterns;
		(_agg$patterns = agg.patterns) !== null && _agg$patterns !== void 0 || (agg.patterns = /* @__PURE__ */ new Set());
		agg.patterns.add(pattern);
	};
	var intersectMime = (agg, mime) => {
		agg.mime = agg.mime ? agg.mime.filter((m) => mime.includes(m)) : [...mime];
	};
	var setFormat = (agg, format) => {
		agg.format = format;
		if (format.includes("int")) agg.isInt = true;
	};
	var minContributor = (agg, def) => narrowMin(agg, "minimum", def.minimum);
	var maxContributor = (agg, def) => narrowMax(agg, "maximum", def.maximum);
	var formatContributor = (ranges) => (agg, def) => {
		setFormat(agg, def.format);
		const [minimum, maximum] = ranges[def.format];
		narrowMin(agg, "minimum", minimum);
		narrowMax(agg, "maximum", maximum);
	};
	var contributors = {
		greater_than: (agg, def) => narrowMin(agg, def.inclusive ? "minimum" : "exclusiveMinimum", def.value),
		less_than: (agg, def) => narrowMax(agg, def.inclusive ? "maximum" : "exclusiveMaximum", def.value),
		multiple_of: (agg, def) => addDivisor(agg, def.value),
		number_format: formatContributor(NUMBER_FORMAT_RANGES),
		bigint_format: formatContributor(BIGINT_FORMAT_RANGES),
		min_length: minContributor,
		max_length: maxContributor,
		length_equals: (agg, def) => narrowBoth(agg, def.length),
		min_size: minContributor,
		max_size: maxContributor,
		size_equals: (agg, def) => narrowBoth(agg, def.size),
		string_format: (agg, def) => {
			setFormat(agg, def.format);
			if (def.pattern) addPattern(agg, def.pattern);
			if (def.format === "base64" || def.format === "base64url") agg.contentEncoding = def.format;
			if (def.local || def.precision === -1) agg.laxFormat = true;
		},
		mime_type: (agg, def) => intersectMime(agg, def.mime)
	};
	function aggregateChecks(schema) {
		var _def$checks, _def$checks2, _contributors$ch$_zod, _bag$patterns;
		const agg = {};
		const def = schema._zod.def;
		const list = schema._zod.traits.has("$ZodCheck") ? [schema, ...(_def$checks = def.checks) !== null && _def$checks !== void 0 ? _def$checks : []] : (_def$checks2 = def.checks) !== null && _def$checks2 !== void 0 ? _def$checks2 : [];
		for (const ch of list) (_contributors$ch$_zod = contributors[ch._zod.def.check]) === null || _contributors$ch$_zod === void 0 || _contributors$ch$_zod.call(contributors, agg, ch._zod.def);
		const bag = schema._zod.bag;
		if (bag.minimum !== void 0) narrowMin(agg, "minimum", bag.minimum);
		if (bag.exclusiveMinimum !== void 0) narrowMin(agg, "exclusiveMinimum", bag.exclusiveMinimum);
		if (bag.maximum !== void 0) narrowMax(agg, "maximum", bag.maximum);
		if (bag.exclusiveMaximum !== void 0) narrowMax(agg, "exclusiveMaximum", bag.exclusiveMaximum);
		if (bag.multipleOf !== void 0) addDivisor(agg, bag.multipleOf);
		if (bag.format !== void 0) {
			var _agg$format;
			(_agg$format = agg.format) !== null && _agg$format !== void 0 || (agg.format = bag.format);
			if (bag.format.includes("int")) agg.isInt = true;
		}
		if (bag.mime) intersectMime(agg, bag.mime);
		for (const pattern of (_bag$patterns = bag.patterns) !== null && _bag$patterns !== void 0 ? _bag$patterns : []) addPattern(agg, pattern);
		return agg;
	}
	var formatMap = {
		guid: "uuid",
		url: "uri",
		datetime: "date-time",
		json_string: "json-string",
		regex: ""
	};
	var exactPatterns = /* @__PURE__ */ new Map([[base64Charset, base64], [base64urlCharset, base64url]]);
	var exactPattern = (p) => {
		var _exactPatterns$get;
		return (_exactPatterns$get = exactPatterns.get(p)) !== null && _exactPatterns$get !== void 0 ? _exactPatterns$get : p;
	};
	var stringProcessor = (schema, ctx, _json, _params) => {
		const json = _json;
		json.type = "string";
		const { minimum, maximum, format, patterns, contentEncoding, laxFormat } = aggregateChecks(schema);
		if (typeof minimum === "number") json.minLength = minimum;
		if (typeof maximum === "number") json.maxLength = maximum;
		if (format) {
			var _formatMap$format;
			json.format = (_formatMap$format = formatMap[format]) !== null && _formatMap$format !== void 0 ? _formatMap$format : format;
			if (json.format === "") delete json.format;
			if (format === "time" || laxFormat) delete json.format;
		}
		if (contentEncoding) json.contentEncoding = contentEncoding;
		if (patterns && patterns.size > 0) {
			const patternList = [...patterns].map(exactPattern);
			if (patternList.length === 1) json.pattern = patternList[0].source;
			else if (patternList.length > 1) json.allOf = [...patternList.map((regex) => _objectSpread2(_objectSpread2({}, ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {}), {}, { pattern: regex.source }))];
		}
	};
	var numberProcessor = (schema, ctx, _json, params) => {
		const json = _json;
		const { minimum, maximum, multipleOf, exclusiveMaximum, exclusiveMinimum, isInt } = aggregateChecks(schema);
		json.type = isInt ? "integer" : "number";
		const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum !== null && minimum !== void 0 ? minimum : Number.NEGATIVE_INFINITY);
		const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum !== null && maximum !== void 0 ? maximum : Number.POSITIVE_INFINITY);
		const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
		if (exMin) {
			if (legacy) {
				json.minimum = exclusiveMinimum;
				json.exclusiveMinimum = true;
			} else json.exclusiveMinimum = exclusiveMinimum;
		} else if (typeof minimum === "number") json.minimum = minimum;
		if (exMax) {
			if (legacy) {
				json.maximum = exclusiveMaximum;
				json.exclusiveMaximum = true;
			} else json.exclusiveMaximum = exclusiveMaximum;
		} else if (typeof maximum === "number") json.maximum = maximum;
		if (multipleOf) {
			var _json$allOf;
			const divisors = /* @__PURE__ */ new Set();
			for (const divisor of multipleOf) if (Number.isFinite(divisor) && divisor !== 0) divisors.add(Math.abs(divisor));
			else handleUnrepresentable(schema, ctx, json, params, `A multipleOf divisor of ${divisor} cannot be represented in JSON Schema`);
			const [first, ...rest] = divisors;
			if (first !== void 0) json.multipleOf = first;
			if (rest.length) json.allOf = [...(_json$allOf = json.allOf) !== null && _json$allOf !== void 0 ? _json$allOf : [], ...rest.map((m) => ({ multipleOf: m }))];
		}
	};
	var booleanProcessor = (_schema, _ctx, json, _params) => {
		json.type = "boolean";
	};
	var neverProcessor = (_schema, _ctx, json, _params) => {
		json.not = {};
	};
	var enumProcessor = (schema, _ctx, json, _params) => {
		const def = schema._zod.def;
		const values = getEnumValues(def.entries);
		if (values.length === 0) {
			json.not = {};
			return;
		}
		if (values.every((v) => typeof v === "number")) json.type = "number";
		if (values.every((v) => typeof v === "string")) json.type = "string";
		json.enum = values;
	};
	var literalProcessor = (schema, ctx, json, params) => {
		const def = schema._zod.def;
		if (def.values.length === 0) {
			json.not = {};
			return;
		}
		const vals = [];
		for (const val of def.values) if (val === void 0) {
			if (handleUnrepresentable(schema, ctx, json, params, "Literal `undefined` cannot be represented in JSON Schema")) return;
		} else if (typeof val === "bigint") {
			if (handleUnrepresentable(schema, ctx, json, params, "BigInt literals cannot be represented in JSON Schema")) return;
			vals.push(Number(val));
		} else vals.push(val);
		if (vals.length === 0) {} else if (vals.length === 1) {
			const val = vals[0];
			json.type = val === null ? "null" : typeof val;
			if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") json.enum = [val];
			else json.const = val;
		} else {
			if (vals.every((v) => typeof v === "number")) json.type = "number";
			if (vals.every((v) => typeof v === "string")) json.type = "string";
			if (vals.every((v) => typeof v === "boolean")) json.type = "boolean";
			if (vals.every((v) => v === null)) json.type = "null";
			json.enum = vals;
		}
	};
	var customProcessor = (schema, ctx, json, params) => {
		handleUnrepresentable(schema, ctx, json, params, "Custom types cannot be represented in JSON Schema");
	};
	var transformProcessor = (schema, ctx, json, params) => {
		handleUnrepresentable(schema, ctx, json, params, "Transforms cannot be represented in JSON Schema");
	};
	var arrayProcessor = (schema, ctx, _json, params) => {
		const json = _json;
		const def = schema._zod.def;
		const { minimum, maximum } = aggregateChecks(schema);
		if (typeof minimum === "number") json.minItems = minimum;
		if (typeof maximum === "number") json.maxItems = maximum;
		json.type = "array";
		json.items = processSchema(def.element, ctx, _objectSpread2(_objectSpread2({}, params), {}, { path: [...params.path, "items"] }));
	};
	function inputOptin(schema) {
		const def = schema._zod.def;
		if (def.type === "pipe" && def.in._zod.traits.has("$ZodTransform")) return inputOptin(def.out);
		if (def.type === "catch") return inputOptin(def.innerType);
		return schema._zod.optin;
	}
	var objectProcessor = (schema, ctx, _json, params) => {
		var _def$catchall;
		const json = _json;
		const def = schema._zod.def;
		const shape = def.shape;
		if (Object.getOwnPropertySymbols(shape).length && handleUnrepresentable(schema, ctx, json, params, "Symbol keys cannot be represented in JSON Schema")) return;
		json.type = "object";
		json.properties = {};
		for (const key in shape) assignProp(json.properties, key, processSchema(shape[key], ctx, _objectSpread2(_objectSpread2({}, params), {}, { path: [
			...params.path,
			"properties",
			key
		] })));
		const requiredKeys = [];
		for (const key of Object.keys(shape)) {
			const field = def.shape[key];
			if (ctx.io === "input" ? inputOptin(field) === void 0 : field._zod.optout === void 0) requiredKeys.push(key);
		}
		if (requiredKeys.length > 0) json.required = requiredKeys;
		if (((_def$catchall = def.catchall) === null || _def$catchall === void 0 ? void 0 : _def$catchall._zod.def.type) === "never") json.additionalProperties = false;
		else if (!def.catchall) {
			if (ctx.io === "output") json.additionalProperties = false;
		} else if (def.catchall) json.additionalProperties = processSchema(def.catchall, ctx, _objectSpread2(_objectSpread2({}, params), {}, { path: [...params.path, "additionalProperties"] }));
	};
	var unionProcessor = (schema, ctx, json, params) => {
		const def = schema._zod.def;
		const isExclusive = def.inclusive === false;
		const options = def.options.map((x, i) => processSchema(x, ctx, _objectSpread2(_objectSpread2({}, params), {}, { path: [
			...params.path,
			isExclusive ? "oneOf" : "anyOf",
			i
		] })));
		if (isExclusive) json.oneOf = options;
		else json.anyOf = options;
	};
	var intersectionProcessor = (schema, ctx, json, params) => {
		const def = schema._zod.def;
		const a = processSchema(def.left, ctx, _objectSpread2(_objectSpread2({}, params), {}, { path: [
			...params.path,
			"allOf",
			0
		] }));
		const b = processSchema(def.right, ctx, _objectSpread2(_objectSpread2({}, params), {}, { path: [
			...params.path,
			"allOf",
			1
		] }));
		const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
		const allOf = [...isSimpleIntersection(a) ? a.allOf : [a], ...isSimpleIntersection(b) ? b.allOf : [b]];
		json.allOf = allOf;
		ctx.intersections.push(allOf);
	};
	var tupleProcessor = (schema, ctx, _json, params) => {
		const json = _json;
		const def = schema._zod.def;
		json.type = "array";
		const prefixPath = ctx.target === "draft-2020-12" ? "prefixItems" : "items";
		const restPath = ctx.target === "draft-2020-12" ? "items" : ctx.target === "openapi-3.0" ? "items" : "additionalItems";
		const prefixItems = def.items.map((x, i) => processSchema(x, ctx, _objectSpread2(_objectSpread2({}, params), {}, { path: [
			...params.path,
			prefixPath,
			i
		] })));
		const rest = def.rest ? processSchema(def.rest, ctx, _objectSpread2(_objectSpread2({}, params), {}, { path: [
			...params.path,
			restPath,
			...ctx.target === "openapi-3.0" ? [def.items.length] : []
		] })) : null;
		let minItems = def.items.length;
		while (minItems > 0) {
			const item = def.items[minItems - 1];
			if (!(ctx.io === "input" ? inputOptin(item) !== void 0 : item._zod.optout === "optional")) break;
			minItems--;
		}
		const maxItems = def.items.length;
		const isClosed = !def.rest;
		if (ctx.target === "draft-2020-12") {
			json.prefixItems = prefixItems;
			if (isClosed) json.items = false;
			else if (rest) json.items = rest;
			if (minItems > 0) json.minItems = minItems;
			if (isClosed) json.maxItems = maxItems;
		} else if (ctx.target === "openapi-3.0") {
			json.items = { anyOf: prefixItems };
			if (rest) json.items.anyOf.push(rest);
			if (minItems > 0) json.minItems = minItems;
			if (isClosed) json.maxItems = maxItems;
		} else {
			json.items = prefixItems;
			if (isClosed) json.additionalItems = false;
			else if (rest) json.additionalItems = rest;
			if (minItems > 0) json.minItems = minItems;
			if (isClosed) json.maxItems = maxItems;
		}
		const { minimum, maximum } = aggregateChecks(schema);
		if (typeof minimum === "number") json.minItems = minimum;
		if (typeof maximum === "number") json.maxItems = maximum;
	};
	/** JSON object keys are always strings, so a numeric record key schema is re-expressed over the
	* numeric-string form the record parser matches. Deferred to `finalize`, after the flatten: a key
	* behind a wrapper only carries its own `type` before then, and a union key only has its branches.
	*
	* A numeric bound cannot apply to a property name, so `minimum` and its siblings are dropped rather
	* than carried over: keeping them beside `type: "string"` reproduces the match-nothing schema this
	* exists to fix. A key that carries one therefore emits wider than the record parses — `z.record(z.number().min(5), V)`
	* accepts `"3"` — which is the deliberate trade, since throwing on it would reject an ordinary schema
	* outright. */
	function stringifyKeyNames(bySchema, json, visited) {
		var _json$enum;
		if (json.$ref) {
			var _bySchema$get;
			if (visited.has(json)) return json;
			visited.add(json);
			const def = (_bySchema$get = bySchema.get(json)) === null || _bySchema$get === void 0 ? void 0 : _bySchema$get.def;
			if (!def) return json;
			const inlined = stringifyKeyNames(bySchema, def, visited);
			return inlined === def ? json : inlined;
		}
		for (const keyword of ["anyOf", "oneOf"]) {
			const branches = json[keyword];
			if (!Array.isArray(branches)) continue;
			const mapped = branches.map((branch) => stringifyKeyNames(bySchema, branch, visited));
			if (mapped.some((branch, i) => branch !== branches[i])) json = _objectSpread2(_objectSpread2({}, json), {}, { [keyword]: mapped });
		}
		const types = Array.isArray(json.type) ? json.type : [json.type];
		const numericType = !types.includes("string") && types.some((t) => t === "number" || t === "integer");
		const values = (_json$enum = json.enum) !== null && _json$enum !== void 0 ? _json$enum : json.const !== void 0 ? [json.const] : void 0;
		if (!numericType && !(values === null || values === void 0 ? void 0 : values.some((v) => typeof v === "number"))) return json;
		const { minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf, format, id } = json, rest = _objectWithoutProperties(json, _excluded);
		if (rest.enum) rest.enum = rest.enum.map((v) => typeof v === "number" ? String(v) : v);
		else if (typeof rest.const === "number") rest.const = String(rest.const);
		if (!numericType) return rest;
		rest.type = "string";
		if (!values) rest.pattern = (types.includes("number") ? number$1 : integer).source;
		return rest;
	}
	/** Every record of one conversion, so the carriers are found in a single pass rather than once per record. */
	var pendingRecords = /* @__PURE__ */ new WeakMap();
	function rewriteKeyNames(ctx) {
		var _pendingRecords$get;
		const bySchema = /* @__PURE__ */ new Map();
		for (const entry of ctx.seen.values()) if (entry.def && !bySchema.has(entry.schema)) bySchema.set(entry.schema, entry);
		const rewrites = /* @__PURE__ */ new Map();
		for (const record of (_pendingRecords$get = pendingRecords.get(ctx)) !== null && _pendingRecords$get !== void 0 ? _pendingRecords$get : []) {
			var _ref, _seen$def;
			const seen = ctx.seen.get(record);
			const names = (_ref = (_seen$def = seen === null || seen === void 0 ? void 0 : seen.def) !== null && _seen$def !== void 0 ? _seen$def : seen === null || seen === void 0 ? void 0 : seen.schema) === null || _ref === void 0 ? void 0 : _ref.propertyNames;
			if (!names || names === true || rewrites.has(names)) continue;
			const rewritten = stringifyKeyNames(bySchema, names, /* @__PURE__ */ new Set());
			if (rewritten !== names) rewrites.set(names, rewritten);
		}
		if (!rewrites.size) return;
		for (const entry of ctx.seen.values()) for (const carrier of [entry.schema, entry.def]) {
			const rewritten = carrier && rewrites.get(carrier.propertyNames);
			if (rewritten) carrier.propertyNames = rewritten;
		}
	}
	var recordProcessor = (schema, ctx, _json, params) => {
		const json = _json;
		const def = schema._zod.def;
		json.type = "object";
		const keyType = def.keyType;
		const patterns = aggregateChecks(keyType).patterns;
		if (def.mode === "loose" && patterns && patterns.size > 0) {
			const valueSchema = processSchema(def.valueType, ctx, _objectSpread2(_objectSpread2({}, params), {}, { path: [
				...params.path,
				"patternProperties",
				"*"
			] }));
			json.patternProperties = {};
			for (const pattern of patterns) assignProp(json.patternProperties, exactPattern(pattern).source, valueSchema);
		} else {
			if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") {
				json.propertyNames = processSchema(def.keyType, ctx, _objectSpread2(_objectSpread2({}, params), {}, { path: [...params.path, "propertyNames"] }));
				let pending = pendingRecords.get(ctx);
				if (!pending) {
					pending = [];
					pendingRecords.set(ctx, pending);
					ctx.deferred.push(() => rewriteKeyNames(ctx));
				}
				pending.push(schema);
			}
			json.additionalProperties = processSchema(def.valueType, ctx, _objectSpread2(_objectSpread2({}, params), {}, { path: [...params.path, "additionalProperties"] }));
		}
		const keyValues = keyType._zod.values;
		const omittableOnInput = ctx.io === "input" && inputOptin(def.valueType) !== void 0;
		if (keyValues && !def.partial && !omittableOnInput) {
			const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
			if (validKeyValues.length > 0) json.required = validKeyValues.map(String);
		}
	};
	var nullableProcessor = (schema, ctx, json, params) => {
		const def = schema._zod.def;
		const inner = processSchema(def.innerType, ctx, params);
		const seen = ctx.seen.get(schema);
		if (ctx.target === "openapi-3.0") {
			seen.ref = def.innerType;
			json.nullable = true;
		} else json.anyOf = [inner, { type: "null" }];
	};
	var nonoptionalProcessor = (schema, ctx, _json, params) => {
		const def = schema._zod.def;
		processSchema(def.innerType, ctx, params);
		const seen = ctx.seen.get(schema);
		seen.ref = def.innerType;
	};
	/** Round-trips a default value through JSON so the emitted schema is guaranteed to be valid JSON.
	* A BigInt has no reliable encoding, so it goes through `unrepresentable` like any other
	* unrepresentable value. Returns a sentinel when the caller must not write a default of its own. */
	var UNREPRESENTABLE_DEFAULT = Symbol();
	function serializeDefaultValue(value, schema, ctx, json, params) {
		let unrepresentable = false;
		const serialized = JSON.stringify(value, (_, val) => {
			if (typeof val !== "bigint") return val;
			unrepresentable = true;
			return null;
		});
		if (!unrepresentable) return JSON.parse(serialized);
		handleUnrepresentable(schema, ctx, json, params, "BigInt defaults cannot be represented in JSON Schema");
		return UNREPRESENTABLE_DEFAULT;
	}
	var defaultProcessor = (schema, ctx, json, params) => {
		const def = schema._zod.def;
		processSchema(def.innerType, ctx, params);
		const seen = ctx.seen.get(schema);
		seen.ref = def.innerType;
		const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
		if (value !== UNREPRESENTABLE_DEFAULT) json.default = value;
	};
	var prefaultProcessor = (schema, ctx, json, params) => {
		const def = schema._zod.def;
		processSchema(def.innerType, ctx, params);
		const seen = ctx.seen.get(schema);
		seen.ref = def.innerType;
		if (ctx.io !== "input") return;
		const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
		if (value !== UNREPRESENTABLE_DEFAULT) json._prefault = value;
	};
	var catchProcessor = (schema, ctx, json, params) => {
		const def = schema._zod.def;
		processSchema(def.innerType, ctx, params);
		const seen = ctx.seen.get(schema);
		seen.ref = def.innerType;
		let catchValue;
		try {
			catchValue = def.catchValue(void 0);
		} catch (_unused) {
			handleUnrepresentable(schema, ctx, json, params, "Dynamic catch values are not supported in JSON Schema");
			return;
		}
		json.default = catchValue;
	};
	var pipeProcessor = (schema, ctx, _json, params) => {
		const def = schema._zod.def;
		const inIsTransform = def.in._zod.traits.has("$ZodTransform");
		const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
		processSchema(innerType, ctx, params);
		const seen = ctx.seen.get(schema);
		seen.ref = innerType;
	};
	var readonlyProcessor = (schema, ctx, json, params) => {
		const def = schema._zod.def;
		processSchema(def.innerType, ctx, params);
		const seen = ctx.seen.get(schema);
		seen.ref = def.innerType;
		json.readOnly = true;
	};
	var optionalProcessor = (schema, ctx, _json, params) => {
		const def = schema._zod.def;
		processSchema(def.innerType, ctx, params);
		const seen = ctx.seen.get(schema);
		seen.ref = def.innerType;
	};
	var lazyProcessor = (schema, ctx, _json, params) => {
		const innerType = schema._zod.innerType;
		processSchema(innerType, ctx, params);
		const seen = ctx.seen.get(schema);
		seen.ref = innerType;
	};
	// node_modules/zod/v4/classic/errors.js
	var _installedErrorProtos = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
	function _lazyMethod(proto, key, make) {
		Object.defineProperty(proto, key, {
			configurable: true,
			enumerable: false,
			get() {
				const value = make(this);
				Object.defineProperty(this, key, {
					value,
					configurable: true,
					writable: true
				});
				return value;
			},
			set(value) {
				Object.defineProperty(this, key, {
					value,
					configurable: true,
					writable: true
				});
			}
		});
	}
	var initializer = (inst, issues) => {
		$ZodError.init(inst, issues);
		inst.name = "ZodError";
		const proto = Object.getPrototypeOf(inst);
		if (_installedErrorProtos.has(proto)) return;
		_installedErrorProtos.add(proto);
		_lazyMethod(proto, "format", (self) => (mapper) => formatError(self, mapper));
		_lazyMethod(proto, "flatten", (self) => (mapper) => flattenError(self, mapper));
		_lazyMethod(proto, "addIssue", (self) => (issue) => {
			self.issues.push(issue);
			self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
		});
		_lazyMethod(proto, "addIssues", (self) => (issues) => {
			self.issues.push(...issues);
			self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
		});
		Object.defineProperty(proto, "isEmpty", {
			configurable: true,
			enumerable: false,
			get() {
				return this.issues.length === 0;
			}
		});
	};
	var ZodRealError = /*@__PURE__*/ $constructor("ZodError", initializer, void 0, { Parent: Error });
	// node_modules/zod/v4/classic/parse.js
	var parse = /* @__PURE__ */ _parse(ZodRealError);
	var parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
	var safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
	var safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
	var encode = /* @__PURE__ */ _encode(ZodRealError);
	var decode = /* @__PURE__ */ _decode(ZodRealError);
	var encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
	var decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
	var safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
	var safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
	var safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
	var safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);
	// node_modules/zod/v4/classic/schemas.js
	function _ensureDefaultLocale() {
		if (!globalConfig.localeError) config(en_default());
	}
	function _ensureDefaultMemoizer() {
		if (!globalConfig.memoizer) config({ memoizer: memoizer() });
	}
	var ZodType = /*@__PURE__*/ $constructor("ZodType", (inst, def) => {
		_ensureDefaultLocale();
		$ZodType.init(inst, def);
		inst.def = def;
		inst.type = def.type;
		return inst;
	}, {
		check(...chks) {
			var _def$checks;
			const def = this.def;
			return this.clone(mergeDefs(def, { checks: [...(_def$checks = def.checks) !== null && _def$checks !== void 0 ? _def$checks : [], ...chks.map((ch) => typeof ch === "function" ? { _zod: {
				check: ch,
				def: { check: "custom" },
				onattach: []
			} } : ch)] }), { parent: true });
		},
		with(...chks) {
			return this.check(...chks);
		},
		clone(def, params) {
			return clone(this, def, params);
		},
		brand() {
			return this;
		},
		register(reg, meta) {
			reg.add(this, meta);
			return this;
		},
		refine(check, params) {
			return this.check(refine(check, params));
		},
		superRefine(refinement, params) {
			return this.check(superRefine(refinement, params));
		},
		overwrite(fn) {
			return this.check(/* @__PURE__ */ _overwrite(fn));
		},
		optional() {
			return optional(this);
		},
		exactOptional() {
			return exactOptional(this);
		},
		nullable() {
			return nullable(this);
		},
		nullish() {
			return optional(nullable(this));
		},
		nonoptional(params) {
			return nonoptional(this, params);
		},
		array() {
			return array(this);
		},
		or(arg) {
			return union([this, arg]);
		},
		and(arg) {
			return intersection(this, arg);
		},
		transform(tx) {
			return pipe(this, transform(tx));
		},
		default(d) {
			return _default(this, d);
		},
		prefault(d) {
			return prefault(this, d);
		},
		catch(params) {
			return _catch(this, params);
		},
		pipe(target) {
			return pipe(this, target);
		},
		readonly() {
			return readonly(this);
		},
		describe(description) {
			const cl = this.clone();
			globalRegistry.add(cl, { description });
			return cl;
		},
		meta(...args) {
			if (args.length === 0) return globalRegistry.get(this);
			const cl = this.clone();
			globalRegistry.add(cl, args[0]);
			return cl;
		},
		isOptional() {
			return this.safeParse(void 0).success;
		},
		isNullable() {
			return this.safeParse(null).success;
		},
		apply(fn, ...args) {
			return args.length === 0 ? fn(this) : fn(this, ...args);
		},
		get "~standard"() {
			return hide(this, "~standard", _objectSpread2(_objectSpread2({}, standardProps(this)), {}, { jsonSchema: {
				input: createStandardJSONSchemaMethod(this, "input"),
				output: createStandardJSONSchemaMethod(this, "output")
			} }));
		},
		set "~standard"(value) {
			own(this, "~standard", value);
		},
		parse: function _parse(data, params) {
			return parse(this, data, params, { callee: _parse });
		},
		parseAsync: async function _parseAsync(data, params) {
			return await parseAsync(this, data, params, { callee: _parseAsync });
		},
		safeParse(data, params) {
			return safeParse(this, data, params);
		},
		async safeParseAsync(data, params) {
			return safeParseAsync(this, data, params);
		},
		get spa() {
			var _this;
			return (_this = this) === null || _this === void 0 ? void 0 : _this.safeParseAsync;
		},
		set spa(value) {
			own(this, "spa", value);
		},
		validate(data, params) {
			return validate(this, data, params);
		},
		validateAsync(data, params) {
			return validateAsync$1(this, data, params);
		},
		encode: function _encode(data, params) {
			return encode(this, data, params, { callee: _encode });
		},
		decode: function _decode(data, params) {
			return decode(this, data, params, { callee: _decode });
		},
		encodeAsync: async function _encodeAsync(data, params) {
			return await encodeAsync(this, data, params, { callee: _encodeAsync });
		},
		decodeAsync: async function _decodeAsync(data, params) {
			return await decodeAsync(this, data, params, { callee: _decodeAsync });
		},
		safeEncode(data, params) {
			return safeEncode(this, data, params);
		},
		safeDecode(data, params) {
			return safeDecode(this, data, params);
		},
		async safeEncodeAsync(data, params) {
			return safeEncodeAsync(this, data, params);
		},
		async safeDecodeAsync(data, params) {
			return safeDecodeAsync(this, data, params);
		},
		toJSONSchema(params) {
			return createToJSONSchemaMethod(this, {})(params);
		},
		get description() {
			var _core$globalRegistry$;
			return (_core$globalRegistry$ = globalRegistry.get(this)) === null || _core$globalRegistry$ === void 0 ? void 0 : _core$globalRegistry$.description;
		},
		get _def() {
			return this._zod.def;
		}
	});
	/** @internal */
	var _ZodString = /*@__PURE__*/ $constructor("_ZodString", (inst, def) => {
		$ZodString.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
	}, /*@__PURE__*/ derived({
		format: (inst) => {
			var _processors$aggregate;
			return (_processors$aggregate = aggregateChecks(inst).format) !== null && _processors$aggregate !== void 0 ? _processors$aggregate : null;
		},
		minLength: (inst) => {
			var _processors$aggregate2;
			return (_processors$aggregate2 = aggregateChecks(inst).minimum) !== null && _processors$aggregate2 !== void 0 ? _processors$aggregate2 : null;
		},
		maxLength: (inst) => {
			var _processors$aggregate3;
			return (_processors$aggregate3 = aggregateChecks(inst).maximum) !== null && _processors$aggregate3 !== void 0 ? _processors$aggregate3 : null;
		}
	}, {
		regex(...args) {
			return this.check(/* @__PURE__ */ _regex(...args));
		},
		includes(...args) {
			return this.check(/* @__PURE__ */ _includes(...args));
		},
		startsWith(...args) {
			return this.check(/* @__PURE__ */ _startsWith(...args));
		},
		endsWith(...args) {
			return this.check(/* @__PURE__ */ _endsWith(...args));
		},
		min(...args) {
			return this.check(/* @__PURE__ */ _minLength(...args));
		},
		max(...args) {
			return this.check(/* @__PURE__ */ _maxLength(...args));
		},
		length(...args) {
			return this.check(/* @__PURE__ */ _length(...args));
		},
		nonempty(...args) {
			return this.check(/* @__PURE__ */ _minLength(1, ...args));
		},
		lowercase(params) {
			return this.check(/* @__PURE__ */ _lowercase(params));
		},
		uppercase(params) {
			return this.check(/* @__PURE__ */ _uppercase(params));
		},
		trim() {
			return this.check(/* @__PURE__ */ _trim());
		},
		normalize(...args) {
			return this.check(/* @__PURE__ */ _normalize(...args));
		},
		toLowerCase() {
			return this.check(/* @__PURE__ */ _toLowerCase());
		},
		toUpperCase() {
			return this.check(/* @__PURE__ */ _toUpperCase());
		},
		slugify() {
			return this.check(/* @__PURE__ */ _slugify());
		}
	}));
	var ZodString = /*@__PURE__*/ $constructor("ZodString", (inst, def) => {
		$ZodString.init(inst, def);
		_ZodString.init(inst, def);
	}, {
		email(params) {
			return this.check(/* @__PURE__ */ _email(ZodEmail, params));
		},
		url(params) {
			return this.check(/* @__PURE__ */ _url(ZodURL, params));
		},
		jwt(params) {
			return this.check(/* @__PURE__ */ _jwt(ZodJWT, params));
		},
		emoji(params) {
			return this.check(/* @__PURE__ */ _emoji(ZodEmoji, params));
		},
		guid(params) {
			return this.check(/* @__PURE__ */ _guid(ZodGUID, params));
		},
		uuid(params) {
			return this.check(/* @__PURE__ */ _uuid(ZodUUID, params));
		},
		uuidv4(params) {
			return this.check(/* @__PURE__ */ _uuidv4(ZodUUID, params));
		},
		uuidv6(params) {
			return this.check(/* @__PURE__ */ _uuidv6(ZodUUID, params));
		},
		uuidv7(params) {
			return this.check(/* @__PURE__ */ _uuidv7(ZodUUID, params));
		},
		nanoid(params) {
			return this.check(/* @__PURE__ */ _nanoid(ZodNanoID, params));
		},
		cuid(params) {
			return this.check(/* @__PURE__ */ _cuid(ZodCUID, params));
		},
		cuid2(params) {
			return this.check(/* @__PURE__ */ _cuid2(ZodCUID2, params));
		},
		ulid(params) {
			return this.check(/* @__PURE__ */ _ulid(ZodULID, params));
		},
		base64(params) {
			return this.check(/* @__PURE__ */ _base64(ZodBase64, params));
		},
		base64url(params) {
			return this.check(/* @__PURE__ */ _base64url(ZodBase64URL, params));
		},
		xid(params) {
			return this.check(/* @__PURE__ */ _xid(ZodXID, params));
		},
		ksuid(params) {
			return this.check(/* @__PURE__ */ _ksuid(ZodKSUID, params));
		},
		ipv4(params) {
			return this.check(/* @__PURE__ */ _ipv4(ZodIPv4, params));
		},
		ipv6(params) {
			return this.check(/* @__PURE__ */ _ipv6(ZodIPv6, params));
		},
		cidrv4(params) {
			return this.check(/* @__PURE__ */ _cidrv4(ZodCIDRv4, params));
		},
		cidrv6(params) {
			return this.check(/* @__PURE__ */ _cidrv6(ZodCIDRv6, params));
		},
		e164(params) {
			return this.check(/* @__PURE__ */ _e164(ZodE164, params));
		},
		datetime(params) {
			return this.check(/* @__PURE__ */ _isoDateTime(ZodISODateTime, params));
		},
		date(params) {
			return this.check(/* @__PURE__ */ _isoDate(ZodISODate, params));
		},
		time(params) {
			return this.check(/* @__PURE__ */ _isoTime(ZodISOTime, params));
		},
		duration(params) {
			return this.check(/* @__PURE__ */ _isoDuration(ZodISODuration, params));
		}
	});
	function string(params) {
		return /* @__PURE__ */ _string(ZodString, params);
	}
	var ZodStringFormat = /*@__PURE__*/ $constructor("ZodStringFormat", (inst, def) => {
		$ZodStringFormat.init(inst, def);
		_ZodString.init(inst, def);
	});
	var ZodISODateTime = /*@__PURE__*/ $constructor("ZodISODateTime", (inst, def) => {
		$ZodISODateTime.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodISODate = /*@__PURE__*/ $constructor("ZodISODate", (inst, def) => {
		$ZodISODate.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodISOTime = /*@__PURE__*/ $constructor("ZodISOTime", (inst, def) => {
		$ZodISOTime.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodISODuration = /*@__PURE__*/ $constructor("ZodISODuration", (inst, def) => {
		$ZodISODuration.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodEmail = /*@__PURE__*/ $constructor("ZodEmail", (inst, def) => {
		$ZodEmail.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodGUID = /*@__PURE__*/ $constructor("ZodGUID", (inst, def) => {
		$ZodGUID.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodUUID = /*@__PURE__*/ $constructor("ZodUUID", (inst, def) => {
		$ZodUUID.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodURL = /*@__PURE__*/ $constructor("ZodURL", (inst, def) => {
		$ZodURL.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodEmoji = /*@__PURE__*/ $constructor("ZodEmoji", (inst, def) => {
		$ZodEmoji.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodNanoID = /*@__PURE__*/ $constructor("ZodNanoID", (inst, def) => {
		$ZodNanoID.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	/**
	* @deprecated CUID v1 is deprecated by its authors due to information leakage
	* (timestamps embedded in the id). Use {@link ZodCUID2} instead.
	* See https://github.com/paralleldrive/cuid.
	*/
	var ZodCUID = /*@__PURE__*/ $constructor("ZodCUID", (inst, def) => {
		$ZodCUID.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodCUID2 = /*@__PURE__*/ $constructor("ZodCUID2", (inst, def) => {
		$ZodCUID2.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodULID = /*@__PURE__*/ $constructor("ZodULID", (inst, def) => {
		$ZodULID.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodXID = /*@__PURE__*/ $constructor("ZodXID", (inst, def) => {
		$ZodXID.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodKSUID = /*@__PURE__*/ $constructor("ZodKSUID", (inst, def) => {
		$ZodKSUID.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodIPv4 = /*@__PURE__*/ $constructor("ZodIPv4", (inst, def) => {
		$ZodIPv4.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodIPv6 = /*@__PURE__*/ $constructor("ZodIPv6", (inst, def) => {
		$ZodIPv6.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodCIDRv4 = /*@__PURE__*/ $constructor("ZodCIDRv4", (inst, def) => {
		$ZodCIDRv4.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodCIDRv6 = /*@__PURE__*/ $constructor("ZodCIDRv6", (inst, def) => {
		$ZodCIDRv6.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodBase64 = /*@__PURE__*/ $constructor("ZodBase64", (inst, def) => {
		$ZodBase64.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodBase64URL = /*@__PURE__*/ $constructor("ZodBase64URL", (inst, def) => {
		$ZodBase64URL.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodE164 = /*@__PURE__*/ $constructor("ZodE164", (inst, def) => {
		$ZodE164.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodJWT = /*@__PURE__*/ $constructor("ZodJWT", (inst, def) => {
		$ZodJWT.init(inst, def);
		ZodStringFormat.init(inst, def);
	});
	var ZodNumber = /*@__PURE__*/ $constructor("ZodNumber", (inst, def) => {
		$ZodNumber.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
		inst.isFinite = true;
	}, /*@__PURE__*/ derived({
		minValue: (inst) => {
			const { minimum, exclusiveMinimum } = aggregateChecks(inst);
			return Math.max(minimum !== null && minimum !== void 0 ? minimum : Number.NEGATIVE_INFINITY, exclusiveMinimum !== null && exclusiveMinimum !== void 0 ? exclusiveMinimum : Number.NEGATIVE_INFINITY);
		},
		maxValue: (inst) => {
			const { maximum, exclusiveMaximum } = aggregateChecks(inst);
			return Math.min(maximum !== null && maximum !== void 0 ? maximum : Number.POSITIVE_INFINITY, exclusiveMaximum !== null && exclusiveMaximum !== void 0 ? exclusiveMaximum : Number.POSITIVE_INFINITY);
		},
		isInt: (inst) => {
			const { isInt, multipleOf } = aggregateChecks(inst);
			return !!isInt || !!(multipleOf === null || multipleOf === void 0 ? void 0 : multipleOf.some(Number.isSafeInteger));
		},
		format: (inst) => {
			var _processors$aggregate4;
			return (_processors$aggregate4 = aggregateChecks(inst).format) !== null && _processors$aggregate4 !== void 0 ? _processors$aggregate4 : null;
		}
	}, {
		gt(value, params) {
			return this.check(/* @__PURE__ */ _gt(value, params));
		},
		gte(value, params) {
			return this.check(/* @__PURE__ */ _gte(value, params));
		},
		min(value, params) {
			return this.check(/* @__PURE__ */ _gte(value, params));
		},
		lt(value, params) {
			return this.check(/* @__PURE__ */ _lt(value, params));
		},
		lte(value, params) {
			return this.check(/* @__PURE__ */ _lte(value, params));
		},
		max(value, params) {
			return this.check(/* @__PURE__ */ _lte(value, params));
		},
		int(params) {
			return this.check(int(params));
		},
		safe(params) {
			return this.check(int(params));
		},
		positive(params) {
			return this.check(/* @__PURE__ */ _gt(0, params));
		},
		nonnegative(params) {
			return this.check(/* @__PURE__ */ _gte(0, params));
		},
		negative(params) {
			return this.check(/* @__PURE__ */ _lt(0, params));
		},
		nonpositive(params) {
			return this.check(/* @__PURE__ */ _lte(0, params));
		},
		multipleOf(value, params) {
			return this.check(/* @__PURE__ */ _multipleOf(value, params));
		},
		step(value, params) {
			return this.check(/* @__PURE__ */ _multipleOf(value, params));
		},
		finite() {
			return this;
		}
	}));
	function number(params) {
		return /* @__PURE__ */ _number(ZodNumber, params);
	}
	var ZodNumberFormat = /*@__PURE__*/ $constructor("ZodNumberFormat", (inst, def) => {
		$ZodNumberFormat.init(inst, def);
		ZodNumber.init(inst, def);
	});
	function int(params) {
		return /* @__PURE__ */ _int(ZodNumberFormat, params);
	}
	var ZodBoolean = /*@__PURE__*/ $constructor("ZodBoolean", (inst, def) => {
		$ZodBoolean.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json, params);
	});
	function boolean(params) {
		return /* @__PURE__ */ _boolean(ZodBoolean, params);
	}
	var ZodUnknown = /*@__PURE__*/ $constructor("ZodUnknown", (inst, def) => {
		$ZodUnknown.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => void 0;
	});
	function unknown() {
		return /* @__PURE__ */ _unknown(ZodUnknown);
	}
	var ZodNever = /*@__PURE__*/ $constructor("ZodNever", (inst, def) => {
		$ZodNever.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
	});
	function never(params) {
		return /* @__PURE__ */ _never(ZodNever, params);
	}
	var ZodArray = /*@__PURE__*/ $constructor("ZodArray", (inst, def) => {
		_ensureDefaultMemoizer();
		$ZodArray.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
		inst.element = def.element;
	}, {
		min(n, params) {
			return this.check(/* @__PURE__ */ _minLength(n, params));
		},
		nonempty(params) {
			return this.check(/* @__PURE__ */ _minLength(1, params));
		},
		max(n, params) {
			return this.check(/* @__PURE__ */ _maxLength(n, params));
		},
		length(n, params) {
			return this.check(/* @__PURE__ */ _length(n, params));
		},
		unwrap() {
			return this.element;
		}
	});
	function array(element, params) {
		return /* @__PURE__ */ _array(ZodArray, element, params);
	}
	var ZodObject = /*@__PURE__*/ $constructor("ZodObject", (inst, def) => {
		_ensureDefaultMemoizer();
		$ZodObjectJIT.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
		installLazyProp(inst, "shape", (self) => self._zod.def.shape, false);
	}, {
		keyof() {
			return _enum(Object.keys(this._zod.def.shape));
		},
		catchall(catchall) {
			return this.clone(mergeDefs(this._zod.def, { catchall }));
		},
		passthrough() {
			return this.clone(mergeDefs(this._zod.def, { catchall: unknown() }));
		},
		loose() {
			return this.clone(mergeDefs(this._zod.def, { catchall: unknown() }));
		},
		strict() {
			return this.clone(mergeDefs(this._zod.def, { catchall: never() }));
		},
		strip() {
			return this.clone(mergeDefs(this._zod.def, { catchall: void 0 }));
		},
		extend(incoming) {
			return extend(this, incoming);
		},
		safeExtend(incoming) {
			return safeExtend(this, incoming);
		},
		merge(other) {
			return merge(this, other);
		},
		pick(mask) {
			return pick(this, mask);
		},
		omit(mask) {
			return omit(this, mask);
		},
		partial(...args) {
			return partial(ZodOptional, this, args[0]);
		},
		exactPartial(...args) {
			return partial(ZodExactOptional, this, args[0], "exactPartial");
		},
		required(...args) {
			return required(ZodNonOptional, this, args[0]);
		}
	});
	function object(shape, params) {
		return new ZodObject(_objectSpread2({
			type: "object",
			shape: shape !== null && shape !== void 0 ? shape : {}
		}, normalizeParams(params)));
	}
	var ZodUnion = /*@__PURE__*/ $constructor("ZodUnion", (inst, def) => {
		$ZodUnion.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
		inst.options = def.options;
	});
	function union(options, params) {
		return new ZodUnion(_objectSpread2({
			type: "union",
			options
		}, normalizeParams(params)));
	}
	var ZodDiscriminatedUnion = /*@__PURE__*/ $constructor("ZodDiscriminatedUnion", (inst, def) => {
		ZodUnion.init(inst, def);
		$ZodDiscriminatedUnion.init(inst, def);
	});
	function discriminatedUnion(discriminator, options, params) {
		return new ZodDiscriminatedUnion(_objectSpread2({
			type: "union",
			options,
			discriminator
		}, normalizeParams(params)));
	}
	var ZodIntersection = /*@__PURE__*/ $constructor("ZodIntersection", (inst, def) => {
		$ZodIntersection.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
	});
	function intersection(left, right) {
		return new ZodIntersection({
			type: "intersection",
			left,
			right
		});
	}
	var ZodTuple = /*@__PURE__*/ $constructor("ZodTuple", (inst, def) => {
		_ensureDefaultMemoizer();
		$ZodTuple.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => tupleProcessor(inst, ctx, json, params);
	}, {
		rest(rest) {
			return this.clone(_objectSpread2(_objectSpread2({}, this._zod.def), {}, { rest }));
		},
		partial() {
			var _def$checks2;
			const def = this._zod.def;
			if ((_def$checks2 = def.checks) === null || _def$checks2 === void 0 ? void 0 : _def$checks2.length) throw new Error(".partial() cannot be used on tuple schemas containing refinements");
			return this.clone(_objectSpread2(_objectSpread2({}, def), {}, { items: def.items.map((item) => new ZodOptional({
				type: "optional",
				innerType: item
			})) }));
		}
	});
	function tuple(items, _paramsOrRest, _params) {
		const hasRest = _paramsOrRest instanceof $ZodType;
		return new ZodTuple(_objectSpread2({
			type: "tuple",
			items,
			rest: hasRest ? _paramsOrRest : null
		}, normalizeParams(hasRest ? _params : _paramsOrRest)));
	}
	var ZodRecord = /*@__PURE__*/ $constructor("ZodRecord", (inst, def) => {
		_ensureDefaultMemoizer();
		$ZodRecord.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => recordProcessor(inst, ctx, json, params);
		inst.keyType = def.keyType;
		inst.valueType = def.valueType;
	});
	function record(keyType, valueType, params) {
		if (!valueType || !valueType._zod) return new ZodRecord(_objectSpread2({
			type: "record",
			keyType: string(),
			valueType: keyType
		}, normalizeParams(valueType)));
		return new ZodRecord(_objectSpread2({
			type: "record",
			keyType,
			valueType
		}, normalizeParams(params)));
	}
	var ZodEnum = /*@__PURE__*/ $constructor("ZodEnum", (inst, def) => {
		$ZodEnum.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
		inst.enum = def.entries;
		inst.options = [...inst._zod.values];
		const keys = new Set(Object.keys(def.entries));
		inst.extract = (values, params) => {
			const newEntries = {};
			for (const value of values) if (keys.has(value)) newEntries[value] = def.entries[value];
			else throw new Error(`Key ${value} not found in enum`);
			return new ZodEnum(_objectSpread2(_objectSpread2(_objectSpread2({}, def), {}, { checks: [] }, normalizeParams(params)), {}, { entries: newEntries }));
		};
		inst.exclude = (values, params) => {
			const newEntries = _objectSpread2({}, def.entries);
			for (const value of values) if (keys.has(value)) delete newEntries[value];
			else throw new Error(`Key ${value} not found in enum`);
			return new ZodEnum(_objectSpread2(_objectSpread2(_objectSpread2({}, def), {}, { checks: [] }, normalizeParams(params)), {}, { entries: newEntries }));
		};
	});
	function _enum(values, params) {
		return new ZodEnum(_objectSpread2({
			type: "enum",
			entries: Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values
		}, normalizeParams(params)));
	}
	var ZodLiteral = /*@__PURE__*/ $constructor("ZodLiteral", (inst, def) => {
		$ZodLiteral.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
		inst.values = new Set(def.values);
		Object.defineProperty(inst, "value", { get() {
			if (def.values.length > 1) throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
			return def.values[0];
		} });
	});
	function literal(value, params) {
		return new ZodLiteral(_objectSpread2({
			type: "literal",
			values: Array.isArray(value) ? value : [value]
		}, normalizeParams(params)));
	}
	var ZodTransform = /*@__PURE__*/ $constructor("ZodTransform", (inst, def) => {
		_ensureDefaultMemoizer();
		$ZodTransform.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
		inst._zod.parse = (payload, _ctx) => {
			if (_ctx.direction === "backward") throw new $ZodEncodeError(inst.constructor.name);
			payload.addIssue = (issue$1) => {
				if (typeof issue$1 === "string") payload.issues.push(issue(issue$1, payload.value, def));
				else {
					var _issue$code, _issue$inst;
					const _issue = issue$1;
					if (_issue.fatal) _issue.continue = false;
					(_issue$code = _issue.code) !== null && _issue$code !== void 0 || (_issue.code = "custom");
					if (!("input" in _issue)) _issue.input = payload.value;
					(_issue$inst = _issue.inst) !== null && _issue$inst !== void 0 || (_issue.inst = inst);
					payload.issues.push(issue(_issue));
				}
			};
			const output = def.transform(payload.value, payload);
			if (output instanceof Promise) return output.then((output) => {
				payload.value = output;
				return payload;
			});
			payload.value = output;
			return payload;
		};
	});
	function transform(fn) {
		return new ZodTransform({
			type: "transform",
			transform: fn
		});
	}
	var ZodOptional = /*@__PURE__*/ $constructor("ZodOptional", (inst, def) => {
		$ZodOptional.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
		inst.unwrap = () => inst._zod.def.innerType;
	});
	function optional(innerType) {
		return new ZodOptional({
			type: "optional",
			innerType
		});
	}
	var ZodExactOptional = /*@__PURE__*/ $constructor("ZodExactOptional", (inst, def) => {
		$ZodExactOptional.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
		inst.unwrap = () => inst._zod.def.innerType;
	});
	function exactOptional(innerType) {
		return new ZodExactOptional({
			type: "optional",
			innerType
		});
	}
	var ZodNullable = /*@__PURE__*/ $constructor("ZodNullable", (inst, def) => {
		$ZodNullable.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
		inst.unwrap = () => inst._zod.def.innerType;
	});
	function nullable(innerType) {
		return new ZodNullable({
			type: "nullable",
			innerType
		});
	}
	var ZodDefault = /*@__PURE__*/ $constructor("ZodDefault", (inst, def) => {
		$ZodDefault.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
		inst.unwrap = () => inst._zod.def.innerType;
		inst.removeDefault = inst.unwrap;
	});
	function _default(innerType, defaultValue) {
		return new ZodDefault({
			type: "default",
			innerType,
			get defaultValue() {
				return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
			}
		});
	}
	var ZodPrefault = /*@__PURE__*/ $constructor("ZodPrefault", (inst, def) => {
		$ZodPrefault.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
		inst.unwrap = () => inst._zod.def.innerType;
	});
	function prefault(innerType, defaultValue) {
		return new ZodPrefault({
			type: "prefault",
			innerType,
			get defaultValue() {
				return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
			}
		});
	}
	var ZodNonOptional = /*@__PURE__*/ $constructor("ZodNonOptional", (inst, def) => {
		$ZodNonOptional.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
		inst.unwrap = () => inst._zod.def.innerType;
	});
	function nonoptional(innerType, params) {
		return new ZodNonOptional(_objectSpread2({
			type: "nonoptional",
			innerType
		}, normalizeParams(params)));
	}
	var ZodCatch = /*@__PURE__*/ $constructor("ZodCatch", (inst, def) => {
		$ZodCatch.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
		inst.unwrap = () => inst._zod.def.innerType;
		inst.removeCatch = inst.unwrap;
	});
	function _catch(innerType, catchValue) {
		return new ZodCatch({
			type: "catch",
			innerType,
			catchValue: typeof catchValue === "function" ? catchValue : constantCatch(catchValue)
		});
	}
	var ZodPipe = /*@__PURE__*/ $constructor("ZodPipe", (inst, def) => {
		$ZodPipe.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
		inst.in = def.in;
		inst.out = def.out;
	});
	function pipe(in_, out) {
		return new ZodPipe({
			type: "pipe",
			in: in_,
			out
		});
	}
	var ZodReadonly = /*@__PURE__*/ $constructor("ZodReadonly", (inst, def) => {
		$ZodReadonly.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
		inst.unwrap = () => inst._zod.def.innerType;
	});
	function readonly(innerType) {
		return new ZodReadonly({
			type: "readonly",
			innerType
		});
	}
	var ZodLazy = /*@__PURE__*/ $constructor("ZodLazy", (inst, def) => {
		$ZodLazy.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => lazyProcessor(inst, ctx, json, params);
		inst.unwrap = () => inst._zod.def.getter();
	});
	function lazy(getter) {
		return new ZodLazy({
			type: "lazy",
			getter
		});
	}
	var ZodCustom = /*@__PURE__*/ $constructor("ZodCustom", (inst, def) => {
		$ZodCustom.init(inst, def);
		ZodType.init(inst, def);
		inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
	});
	function refine(fn, _params = {}) {
		return /* @__PURE__ */ _refine(ZodCustom, fn, _params);
	}
	function superRefine(fn, params) {
		return /* @__PURE__ */ _superRefine(fn, params);
	}
	var COLLECTION_NAME = "DS-Studio";
	var PLUGIN_DATA_KEY = "dsStudioId";
	var finite = number().finite();
	var px = number().finite().min(-1e5).max(1e5);
	var tokenKey = string().regex(/^[a-z]+\.[A-Za-z]+$/).max(60);
	var id = string().min(1).max(200);
	var unit = number().min(0).max(1);
	/** Couleur simple (texte, contour, ombre) : liée à une variable si token. */
	var paintSchema = object({
		hex: string().regex(/^#[0-9A-Fa-f]{6}$/),
		opacity: unit,
		variable: tokenKey.optional()
	}).strict();
	var stopSchema = paintSchema.extend({ position: unit });
	/** Fond empilé : couleur, dégradé ou image (comme la liste Fill de Figma). */
	var fillSchema = discriminatedUnion("type", [
		paintSchema.extend({
			type: literal("SOLID"),
			visible: boolean()
		}),
		object({
			type: literal("GRADIENT_LINEAR"),
			/** Angle CSS (0 = vers le haut, 90 = vers la droite). */
			angle: finite,
			stops: array(stopSchema).min(2).max(8),
			opacity: unit,
			visible: boolean()
		}).strict(),
		object({
			type: literal("GRADIENT_RADIAL"),
			stops: array(stopSchema).min(2).max(8),
			opacity: unit,
			visible: boolean()
		}).strict(),
		object({
			type: literal("IMAGE"),
			asset: string().regex(/^[a-f0-9]{16,64}\.(png|jpe?g|webp)$/),
			scaleMode: _enum([
				"FILL",
				"FIT",
				"TILE"
			]),
			opacity: unit,
			visible: boolean()
		}).strict()
	]);
	var strokeSchema = object({
		paint: paintSchema,
		/** Épaisseur uniforme ou par côté (haut, droite, bas, gauche). */
		weight: union([number().min(0).max(100), tuple([
			finite,
			finite,
			finite,
			finite
		])]),
		align: _enum([
			"INSIDE",
			"CENTER",
			"OUTSIDE"
		]),
		dash: array(number().min(0).max(1e3)).max(4),
		visible: boolean()
	}).strict();
	var effectSchema = discriminatedUnion("type", [object({
		type: _enum(["DROP_SHADOW", "INNER_SHADOW"]),
		x: finite,
		y: finite,
		blur: number().min(0).max(1e3),
		spread: finite,
		color: paintSchema,
		visible: boolean()
	}).strict(), object({
		type: _enum(["LAYER_BLUR", "BACKGROUND_BLUR"]),
		radius: number().min(0).max(1e3),
		visible: boolean()
	}).strict()]);
	var lineHeightSchema = discriminatedUnion("unit", [
		object({ unit: literal("AUTO") }).strict(),
		object({
			unit: literal("PIXELS"),
			value: number().min(0).max(2e3)
		}).strict(),
		object({
			unit: literal("PERCENT"),
			value: number().min(0).max(1e3)
		}).strict()
	]);
	var sceneTextSchema = object({
		characters: string().max(1e4),
		fontFamily: string().max(100),
		fontFamilyVariable: tokenKey.optional(),
		fontWeight: number().int().min(100).max(1e3),
		fontSize: number().min(1).max(1e3),
		fontSizeVariable: tokenKey.optional(),
		lineHeight: lineHeightSchema,
		letterSpacing: number().min(-100).max(100),
		align: _enum([
			"LEFT",
			"CENTER",
			"RIGHT",
			"JUSTIFIED"
		]),
		valign: _enum([
			"TOP",
			"CENTER",
			"BOTTOM"
		]),
		textCase: _enum([
			"ORIGINAL",
			"UPPER",
			"LOWER",
			"TITLE"
		]),
		decoration: _enum([
			"NONE",
			"UNDERLINE",
			"STRIKETHROUGH"
		]),
		autoResize: _enum([
			"WIDTH_AND_HEIGHT",
			"HEIGHT",
			"NONE",
			"TRUNCATE"
		]),
		maxLines: number().int().min(1).max(50).nullable(),
		color: paintSchema,
		/** Style de texte Figma à appliquer (id DS-Studio du style). */
		style: id.optional()
	}).strict();
	var sizing = _enum([
		"FIXED",
		"HUG",
		"FILL"
	]);
	var constraint = _enum([
		"MIN",
		"MAX",
		"CENTER",
		"STRETCH"
	]);
	var blend = _enum([
		"NORMAL",
		"MULTIPLY",
		"SCREEN",
		"OVERLAY",
		"DARKEN",
		"LIGHTEN",
		"COLOR_DODGE",
		"COLOR_BURN",
		"HARD_LIGHT",
		"SOFT_LIGHT",
		"DIFFERENCE",
		"EXCLUSION",
		"HUE",
		"SATURATION",
		"COLOR",
		"LUMINOSITY"
	]);
	var layoutSchema = object({
		direction: _enum(["HORIZONTAL", "VERTICAL"]),
		wrap: boolean(),
		gap: number().min(0).max(1e4),
		gapVariable: tokenKey.optional(),
		/** Écart entre lignes (retour à la ligne). */
		counterGap: number().min(0).max(1e4).optional(),
		counterGapVariable: tokenKey.optional(),
		padding: tuple([
			finite,
			finite,
			finite,
			finite
		]),
		paddingVariables: array(tokenKey.nullable()).max(4),
		primary: _enum([
			"MIN",
			"CENTER",
			"MAX",
			"SPACE_BETWEEN"
		]),
		counter: _enum([
			"MIN",
			"CENTER",
			"MAX",
			"BASELINE"
		]),
		/** Le premier enfant passe devant (« Canvas stacking » de Figma). */
		reverseZ: boolean()
	}).strict();
	var propValue = union([string().max(200), boolean()]);
	var sceneNodeSchema = lazy(() => object({
		key: string().max(400).optional(),
		kind: _enum([
			"FRAME",
			"RECTANGLE",
			"TEXT",
			"VECTOR"
		]).optional(),
		name: string().max(200),
		x: px,
		y: px,
		w: px,
		h: px,
		sizingH: sizing,
		sizingV: sizing,
		minW: px.optional(),
		maxW: px.optional(),
		minH: px.optional(),
		maxH: px.optional(),
		visible: boolean().optional(),
		locked: boolean().optional(),
		opacity: unit.optional(),
		blendMode: blend.optional(),
		clip: boolean().optional(),
		rotation: number().min(-360).max(360).optional(),
		absolute: object({
			h: constraint,
			v: constraint
		}).strict().optional(),
		fills: array(fillSchema).max(8).optional(),
		strokes: array(strokeSchema).max(4).optional(),
		effects: array(effectSchema).max(8).optional(),
		effectStyle: id.optional(),
		radius: tuple([
			finite,
			finite,
			finite,
			finite
		]).optional(),
		radiusVariables: array(tokenKey.nullable()).max(4).optional(),
		cornerSmoothing: unit.optional(),
		layout: layoutSchema.optional(),
		text: sceneTextSchema.optional(),
		svg: string().max(2e5).optional(),
		instanceOf: id.optional(),
		overridden: boolean().optional(),
		propValues: record(string().max(60), propValue).optional(),
		refs: object({
			characters: string().max(60),
			visible: string().max(60),
			mainComponent: string().max(60)
		}).partial().strict().optional(),
		children: array(sceneNodeSchema).max(1e3)
	}).strict());
	var variableSchema = object({
		token: tokenKey,
		/** Nom Figma : « color/brand ». */
		name: string().max(100),
		type: _enum([
			"COLOR",
			"FLOAT",
			"STRING"
		]),
		value: union([string().max(200), finite]),
		category: _enum([
			"color",
			"space",
			"radius",
			"typography"
		])
	}).strict();
	var textStyleSchema = object({
		id,
		name: string().max(200),
		fontFamily: string().max(100),
		fontFamilyVariable: tokenKey.optional(),
		fontWeight: number().int().min(100).max(1e3),
		fontSize: number().min(1).max(1e3),
		fontSizeVariable: tokenKey.optional(),
		lineHeight: lineHeightSchema,
		letterSpacing: number().min(-100).max(100),
		sample: string().max(200)
	}).strict();
	var effectStyleSchema = object({
		id,
		name: string().max(200),
		effects: array(effectSchema).min(1).max(8)
	}).strict();
	var componentPropertySchema = object({
		name: string().max(60),
		type: _enum([
			"TEXT",
			"BOOLEAN",
			"INSTANCE_SWAP"
		]),
		/** Échange d'instance : id DS-Studio du composant par défaut. */
		default: propValue
	}).strict();
	var componentDefSchema = object({
		id,
		name: string().max(200),
		/** Component set (ex. « Button ») et variante au format Figma « Prop=Val, … ». */
		set: string().max(200).nullable(),
		variant: string().max(400).nullable(),
		/** Propriétés de composant (portées par le set s'il existe). */
		properties: array(componentPropertySchema).max(50),
		root: sceneNodeSchema
	}).strict();
	/** Images de fond utilisées (base64), envoyées une fois par export. */
	var imageSchema = object({
		asset: string().regex(/^[a-f0-9]{16,64}\.(png|jpe?g|webp)$/),
		data: string().max(3e6)
	}).strict();
	var pageTargetSchema = discriminatedUnion("mode", [
		object({ mode: literal("current") }).strict(),
		object({
			mode: literal("existing"),
			id: string().max(80)
		}).strict(),
		object({
			mode: literal("new"),
			name: string().trim().min(1).max(200)
		}).strict()
	]);
	var base = {
		version: literal(2),
		page: pageTargetSchema,
		variables: array(variableSchema).max(500),
		textStyles: array(textStyleSchema).max(200),
		effectStyles: array(effectStyleSchema).max(100),
		components: array(componentDefSchema).max(300),
		images: array(imageSchema).max(40)
	};
	var exportPayloadSchema = discriminatedUnion("kind", [object(_objectSpread2({ kind: literal("design_system") }, base)).strict(), object(_objectSpread2(_objectSpread2({ kind: literal("preview") }, base), {}, { screen: object({
		id,
		name: string().max(200),
		root: sceneNodeSchema
	}).strict() })).strict()]);
	object({
		pageId: string().max(80),
		pageName: string().max(200),
		created: number().int().min(0),
		updated: number().int().min(0),
		/** Ids DS-Studio des éléments créés par cet export (les autres ont été mis à jour). */
		createdIds: array(string().max(200)).max(1e3),
		warnings: array(string().max(500)).max(200),
		/** Éléments DS-Studio présents dans Figma mais absents de l'app : signalés, jamais supprimés. */
		orphans: array(object({
			id: string(),
			name: string()
		}).strict()).max(500)
	}).strict();
	// figma-plugin/src/code.ts
	figma.showUI(__html__, {
		width: 300,
		height: 180,
		themeColors: true
	});
	var toHex = (c) => "#" + [
		c.r,
		c.g,
		c.b
	].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
	var toRgb = (hex) => ({
		r: parseInt(hex.slice(1, 3), 16) / 255,
		g: parseInt(hex.slice(3, 5), 16) / 255,
		b: parseInt(hex.slice(5, 7), 16) / 255
	});
	var num = (v) => typeof v === "number" && isFinite(v) ? v : null;
	var post = (msg) => figma.ui.postMessage(msg);
	var fileKey = () => typeof figma.fileKey === "string" ? figma.fileKey : null;
	post({ hello: {
		fileKey: fileKey(),
		fileName: String(figma.root.name),
		exportVersion: 2
	} });
	function fills(node) {
		if (!("fills" in node) || !Array.isArray(node.fills)) return null;
		return node.fills.filter((p) => p.type === "SOLID").map((p) => {
			var _num;
			return {
				color: toHex(p.color),
				opacity: (_num = num(p.opacity)) !== null && _num !== void 0 ? _num : 1
			};
		});
	}
	function summary(node) {
		return {
			id: node.id,
			type: node.type,
			name: node.name,
			width: num(node.width),
			height: num(node.height)
		};
	}
	function details(node) {
		return Object.assign(summary(node), {
			x: num(node.x),
			y: num(node.y),
			visible: node.visible !== false,
			rotation: num(node.rotation),
			opacity: num(node.opacity),
			fills: fills(node),
			characters: node.type === "TEXT" ? node.characters : void 0,
			parentId: node.parent ? node.parent.id : null,
			children: "children" in node ? node.children.slice(0, 100).map(summary) : void 0
		});
	}
	async function nodeById(id) {
		const node = await figma.getNodeByIdAsync(id);
		if (!node || node.removed) throw new Error("Nœud introuvable : " + id + ".");
		return node;
	}
	async function loadFonts(text) {
		const fonts = text.fontName === figma.mixed ? text.getRangeAllFontNames(0, text.characters.length) : [text.fontName];
		for (const font of fonts) await figma.loadFontAsync(font);
	}
	var commands = {
		ping: async () => ({
			pong: true,
			time: Date.now()
		}),
		get_document_info: async () => ({
			name: figma.root.name,
			fileKey: fileKey(),
			currentPage: {
				id: figma.currentPage.id,
				name: figma.currentPage.name
			},
			pages: figma.root.children.map((p) => ({
				id: p.id,
				name: p.name
			}))
		}),
		get_file_info: async () => ({
			fileKey: fileKey(),
			name: figma.root.name,
			currentPage: {
				id: figma.currentPage.id,
				name: figma.currentPage.name
			},
			pages: figma.root.children.map((p) => ({
				id: p.id,
				name: p.name
			}))
		}),
		set_target_page: async ({ nodeId }) => {
			var _page;
			let page = null;
			let warning = null;
			if (nodeId) {
				const node = await figma.getNodeByIdAsync(nodeId);
				for (let n = node; n && !n.removed; n = n.parent) if (n.type === "PAGE") {
					page = n;
					break;
				}
				if (!page) warning = `Nœud ${nodeId} introuvable : page courante « ${figma.currentPage.name} » utilisée.`;
			}
			page = (_page = page) !== null && _page !== void 0 ? _page : figma.currentPage;
			if (page !== figma.currentPage) await figma.setCurrentPageAsync(page);
			return {
				pageId: page.id,
				pageName: page.name,
				warning
			};
		},
		get_selection: async () => figma.currentPage.selection.map(summary),
		get_node: async ({ id }) => details(await nodeById(id)),
		create_frame: async ({ x, y, width, height, name, color }) => {
			const frame = figma.createFrame();
			frame.x = x;
			frame.y = y;
			frame.resize(width, height);
			frame.name = name || "Frame DS-Studio";
			frame.fills = [{
				type: "SOLID",
				color: toRgb(color)
			}];
			figma.currentPage.appendChild(frame);
			figma.currentPage.selection = [frame];
			figma.viewport.scrollAndZoomIntoView([frame]);
			return details(frame);
		},
		set_text: async ({ id, text }) => {
			const node = await nodeById(id);
			if (node.type !== "TEXT") throw new Error("Ce nœud n’est pas un texte (" + node.type + ").");
			await loadFonts(node);
			node.characters = text;
			return details(node);
		},
		delete_node: async ({ id }) => {
			const node = await nodeById(id);
			if (node.type === "DOCUMENT" || node.type === "PAGE") throw new Error("Suppression d’une page ou du document refusée.");
			node.remove();
			return { deleted: id };
		}
	};
	var transfers = /* @__PURE__ */ new Map();
	var cancelled = /* @__PURE__ */ new Set();
	var Cancelled = class extends Error {};
	commands.export_chunk = async ({ transfer, index, total, data }) => {
		var _transfers$get;
		const parts = (_transfers$get = transfers.get(transfer)) !== null && _transfers$get !== void 0 ? _transfers$get : new Array(total).fill(null);
		parts[index] = data;
		transfers.set(transfer, parts);
		return {
			received: index + 1,
			total
		};
	};
	commands.cancel = async ({ target }) => {
		cancelled.add(target);
		return { cancelled: target };
	};
	function payloadOf(transfer, kind) {
		const parts = transfers.get(transfer);
		transfers.delete(transfer);
		if (!parts || parts.some((p) => p === null)) throw new Error("Export incomplet : des lots manquent.");
		const raw = JSON.parse(parts.join(""));
		if ((raw === null || raw === void 0 ? void 0 : raw.version) !== 2) throw new Error(`Format d’export v${raw === null || raw === void 0 ? void 0 : raw.version} reçu, ce plugin attend v2. Relancez le plugin DS-Studio Bridge dans Figma et rechargez DS-Studio.`);
		const payload = exportPayloadSchema.parse(raw);
		if (payload.kind !== kind) throw new Error("Type d’export inattendu.");
		return payload;
	}
	commands.export_design_system = async ({ transfer }, id) => new Exporter(id, payloadOf(transfer, "design_system")).run();
	commands.export_preview = async ({ transfer }, id) => new Exporter(id, payloadOf(transfer, "preview")).run();
	function insideInstance(node) {
		for (let n = node; n && n.type !== "PAGE"; n = n.parent) if (n.type === "INSTANCE") return true;
		return false;
	}
	var STYLE_BY_WEIGHT = {
		100: "Thin",
		200: "Extra Light",
		300: "Light",
		400: "Regular",
		500: "Medium",
		600: "Semi Bold",
		700: "Bold",
		800: "Extra Bold",
		900: "Black"
	};
	var SCOPES = {
		color: [
			"ALL_FILLS",
			"STROKE_COLOR",
			"EFFECT_COLOR"
		],
		space: ["GAP", "WIDTH_HEIGHT"],
		radius: ["CORNER_RADIUS"],
		typographyFLOAT: ["FONT_SIZE"],
		typographySTRING: ["FONT_FAMILY"]
	};
	var fontCache = /* @__PURE__ */ new Map();
	var CORNERS = [
		"topLeftRadius",
		"topRightRadius",
		"bottomRightRadius",
		"bottomLeftRadius"
	];
	var lineHeight = (l) => l.unit === "AUTO" ? { unit: "AUTO" } : {
		value: l.value,
		unit: l.unit
	};
	var PAGES_KEY = "dsStudioPages";
	var Exporter = class {
		constructor(id, payload) {
			_defineProperty(this, "id", void 0);
			_defineProperty(this, "payload", void 0);
			_defineProperty(this, "created", 0);
			_defineProperty(this, "createdIds", []);
			_defineProperty(this, "updated", 0);
			_defineProperty(this, "warnings", /* @__PURE__ */ new Set());
			_defineProperty(this, "step", 0);
			_defineProperty(this, "total", void 0);
			_defineProperty(this, "page", void 0);
			_defineProperty(this, "mode", "");
			_defineProperty(this, "index", /* @__PURE__ */ new Map());
			_defineProperty(this, "vars", /* @__PURE__ */ new Map());
			_defineProperty(this, "textStyles", /* @__PURE__ */ new Map());
			_defineProperty(this, "effectStyles", /* @__PURE__ */ new Map());
			_defineProperty(this, "components", /* @__PURE__ */ new Map());
			_defineProperty(this, "touched", []);
			_defineProperty(this, "images", /* @__PURE__ */ new Map());
			_defineProperty(this, "bindings", []);
			_defineProperty(this, "pendingProps", []);
			_defineProperty(this, "duplicates", /* @__PURE__ */ new Map());
			this.id = id;
			this.payload = payload;
			const p = payload;
			this.total = p.variables.length + p.textStyles.length + p.effectStyles.length + p.components.length + (p.kind === "design_system" ? 4 : 1);
		}
		async tick(label) {
			await Promise.resolve();
			if (cancelled.has(this.id)) throw new Cancelled("Export annulé.");
			this.step += 1;
			post({
				id: this.id,
				progress: {
					done: this.step,
					total: this.total,
					label
				}
			});
		}
		mark(node, key, isNew) {
			node.setPluginData(PLUGIN_DATA_KEY, key);
			this.index.set(key, node);
			if (isNew) {
				this.created += 1;
				this.createdIds.push(key);
			} else this.updated += 1;
		}
		async font(family, weight) {
			var _STYLE_BY_WEIGHT;
			const style = (_STYLE_BY_WEIGHT = STYLE_BY_WEIGHT[Math.round(weight / 100) * 100]) !== null && _STYLE_BY_WEIGHT !== void 0 ? _STYLE_BY_WEIGHT : "Regular";
			const tries = [
				{
					family,
					style
				},
				{
					family,
					style: weight >= 600 ? "Bold" : "Regular"
				},
				{
					family: "Inter",
					style
				},
				{
					family: "Inter",
					style: weight >= 600 ? "Bold" : "Regular"
				},
				{
					family: "Inter",
					style: "Regular"
				}
			];
			for (const f of tries) {
				const key = f.family + "|" + f.style;
				if (fontCache.get(key) === false) continue;
				try {
					if (!fontCache.get(key)) await figma.loadFontAsync(f);
					fontCache.set(key, true);
					if (f.family !== family) this.warnings.add(`Police « ${family} » absente dans Figma : Inter utilisée.`);
					return f;
				} catch (_unused) {
					fontCache.set(key, false);
				}
			}
			throw new Error("Aucune police utilisable (Inter introuvable).");
		}
		paint(p) {
			const paint = {
				type: "SOLID",
				color: toRgb(p.hex),
				opacity: p.opacity
			};
			const v = p.variable && this.vars.get(p.variable);
			return v ? figma.variables.setBoundVariableForPaint(paint, "color", v) : paint;
		}
		bind(node, field, token) {
			const v = token && this.vars.get(token);
			if (!v) return;
			try {
				node.setBoundVariable(field, v);
			} catch (_unused2) {
				this.warnings.add(`Liaison « ${field} » impossible sur ${node.name}.`);
			}
		}
		async run() {
			try {
				this.page = await this.targetPage();
				await this.indexPages();
				await this.variables();
				await this.styles();
				this.loadImages();
				await this.componentDefs(this.payload.kind === "design_system");
				if (this.payload.kind === "design_system") await this.boards();
				else await this.screen(this.payload.screen);
				this.rememberPage();
				await figma.setCurrentPageAsync(this.page);
				if (this.touched.length) figma.viewport.scrollAndZoomIntoView(this.touched);
				return {
					pageId: this.page.id,
					pageName: this.page.name,
					created: this.created,
					updated: this.updated,
					createdIds: this.createdIds.slice(0, 1e3),
					warnings: [...this.warnings].slice(0, 200),
					orphans: this.payload.kind === "design_system" ? await this.orphans() : []
				};
			} finally {
				cancelled.delete(this.id);
			}
		}
		async indexPages() {
			let known = [];
			try {
				known = JSON.parse(figma.root.getPluginData(PAGES_KEY) || "[]");
			} catch (_unused3) {
				known = [];
			}
			const ids = [
				this.page.id,
				figma.currentPage.id,
				...known
			].filter((id, i, all) => all.indexOf(id) === i);
			for (const id of ids) {
				const page = figma.root.children.find((p) => p.id === id);
				if (!page) continue;
				if (cancelled.has(this.id)) throw new Cancelled("Export annulé.");
				post({
					id: this.id,
					progress: {
						done: 0,
						total: this.total,
						label: `Lecture de la page ${page.name}…`
					}
				});
				try {
					await page.loadAsync();
				} catch (_unused4) {
					if (page === this.page) throw new Error(`Figma n’arrive pas à charger la page « ${page.name} » (connexion de Figma à ses serveurs ?).`);
					this.warnings.add(`Page « ${page.name} » non chargée par Figma : ses éléments DS-Studio n’ont pas été recherchés.`);
					continue;
				}
				for (const n of page.findAllWithCriteria({ pluginData: { keys: [PLUGIN_DATA_KEY] } })) {
					var _this$duplicates$get;
					if (insideInstance(n)) continue;
					const key = n.getPluginData(PLUGIN_DATA_KEY);
					const first = this.index.get(key);
					if (!first) this.index.set(key, n);
					else if (first.type === n.type) this.duplicates.set(key, [...(_this$duplicates$get = this.duplicates.get(key)) !== null && _this$duplicates$get !== void 0 ? _this$duplicates$get : [first], n]);
				}
			}
			for (const [key, nodes] of this.duplicates) this.warnings.add(`Doublon : ${nodes.length} éléments portent l’id « ${key} » (${nodes.map((n) => n.id).join(", ")}) ; le premier est mis à jour, les autres sont à supprimer à la main.`);
		}
		rememberPage() {
			let known = [];
			try {
				known = JSON.parse(figma.root.getPluginData(PAGES_KEY) || "[]");
			} catch (_unused5) {
				known = [];
			}
			if (!known.includes(this.page.id)) figma.root.setPluginData(PAGES_KEY, JSON.stringify([...known, this.page.id]));
		}
		async targetPage() {
			const t = this.payload.page;
			if (t.mode === "current") return figma.currentPage;
			if (t.mode === "existing") {
				const page = await figma.getNodeByIdAsync(t.id);
				if (!page || page.type !== "PAGE") throw new Error("Page cible introuvable dans le fichier.");
				return page;
			}
			const same = figma.root.children.find((p) => p.name === t.name);
			if (same) {
				this.warnings.add(`La page « ${t.name} » existait : elle a été réutilisée.`);
				return same;
			}
			const page = figma.createPage();
			page.name = t.name;
			return page;
		}
		async variables() {
			var _collection$defaultMo;
			let collection = (await figma.variables.getLocalVariableCollectionsAsync()).find((c) => c.name === COLLECTION_NAME);
			if (!collection) {
				collection = figma.variables.createVariableCollection(COLLECTION_NAME);
				collection.renameMode(collection.modes[0].modeId, "Défaut");
				this.created += 1;
			}
			this.mode = (_collection$defaultMo = collection.defaultModeId) !== null && _collection$defaultMo !== void 0 ? _collection$defaultMo : collection.modes[0].modeId;
			const byName = /* @__PURE__ */ new Map();
			for (const id of collection.variableIds) {
				const v = await figma.variables.getVariableByIdAsync(id);
				if (v) byName.set(v.name, v);
			}
			for (const t of this.payload.variables) {
				await this.tick(`Variable ${t.name}`);
				let v = byName.get(t.name);
				if (v && v.resolvedType !== t.type) {
					this.warnings.add(`Variable ${t.name} : type ${v.resolvedType} incompatible, ignorée.`);
					continue;
				}
				const isNew = !v;
				if (!v) v = figma.variables.createVariable(t.name, collection, t.type);
				v.setValueForMode(this.mode, t.type === "COLOR" ? _objectSpread2(_objectSpread2({}, toRgb(String(t.value))), {}, { a: 1 }) : t.value);
				try {
					var _ref, _SCOPES$t$category;
					v.scopes = (_ref = (_SCOPES$t$category = SCOPES[t.category]) !== null && _SCOPES$t$category !== void 0 ? _SCOPES$t$category : SCOPES[t.category + t.type]) !== null && _ref !== void 0 ? _ref : ["ALL_SCOPES"];
				} catch (_unused6) {}
				this.mark(v, "var/" + t.token, isNew);
				this.vars.set(t.token, v);
			}
		}
		async styles() {
			const texts = await figma.getLocalTextStylesAsync();
			for (const t of this.payload.textStyles) {
				var _texts$find;
				await this.tick(`Style ${t.name}`);
				let style = (_texts$find = texts.find((s) => s.getPluginData("dsStudioId") === t.id)) !== null && _texts$find !== void 0 ? _texts$find : texts.find((s) => s.name === t.name);
				const isNew = !style;
				if (!style) style = figma.createTextStyle();
				style.name = t.name;
				const font = await this.font(t.fontFamily, t.fontWeight);
				style.fontName = font;
				style.fontSize = t.fontSize;
				style.lineHeight = lineHeight(t.lineHeight);
				style.letterSpacing = {
					value: t.letterSpacing,
					unit: "PIXELS"
				};
				this.bind(style, "fontSize", t.fontSizeVariable);
				if (font.family === t.fontFamily) this.bind(style, "fontFamily", t.fontFamilyVariable);
				this.mark(style, t.id, isNew);
				this.textStyles.set(t.id, style);
			}
			const effects = await figma.getLocalEffectStylesAsync();
			for (const e of this.payload.effectStyles) {
				var _effects$find;
				await this.tick(`Style ${e.name}`);
				let style = (_effects$find = effects.find((s) => s.getPluginData("dsStudioId") === e.id)) !== null && _effects$find !== void 0 ? _effects$find : effects.find((s) => s.name === e.name);
				const isNew = !style;
				if (!style) style = figma.createEffectStyle();
				style.name = e.name;
				style.effects = e.effects.map((x) => this.effect(x));
				this.mark(style, e.id, isNew);
				this.effectStyles.set(e.id, style);
			}
		}
		loadImages() {
			for (const img of this.payload.images) try {
				const image = figma.createImage(figma.base64Decode(img.data));
				this.images.set(img.asset, image.hash);
			} catch (_unused7) {
				this.warnings.add(`Image ${img.asset} illisible par Figma.`);
			}
		}
		fill(f) {
			if (f.type === "SOLID") {
				const paint = {
					type: "SOLID",
					color: toRgb(f.hex),
					opacity: f.opacity,
					visible: f.visible
				};
				const v = f.variable && this.vars.get(f.variable);
				return v ? figma.variables.setBoundVariableForPaint(paint, "color", v) : paint;
			}
			if (f.type === "IMAGE") {
				const imageHash = this.images.get(f.asset);
				if (!imageHash) {
					this.warnings.add(`Image ${f.asset} absente de l’export : fond ignoré.`);
					return null;
				}
				return {
					type: "IMAGE",
					imageHash,
					scaleMode: f.scaleMode,
					opacity: f.opacity,
					visible: f.visible
				};
			}
			const gradientStops = f.stops.map((s) => ({
				position: s.position,
				color: _objectSpread2(_objectSpread2({}, toRgb(s.hex)), {}, { a: s.opacity })
			}));
			const t = f.type === "GRADIENT_LINEAR" ? (f.angle - 90) * Math.PI / 180 : 0;
			const c = Math.cos(t);
			const s = Math.sin(t);
			return {
				type: f.type,
				gradientStops,
				gradientTransform: [[
					c,
					s,
					.5 - .5 * c - .5 * s
				], [
					-s,
					c,
					.5 + .5 * s - .5 * c
				]],
				opacity: f.opacity,
				visible: f.visible
			};
		}
		effect(e) {
			if ("radius" in e) return {
				type: e.type,
				radius: e.radius,
				visible: e.visible
			};
			const effect = {
				type: e.type,
				color: _objectSpread2(_objectSpread2({}, toRgb(e.color.hex)), {}, { a: e.color.opacity }),
				offset: {
					x: e.x,
					y: e.y
				},
				radius: e.blur,
				spread: e.spread,
				visible: e.visible,
				blendMode: "NORMAL"
			};
			const v = e.color.variable && this.vars.get(e.color.variable);
			if (v && figma.variables.setBoundVariableForEffect) try {
				return figma.variables.setBoundVariableForEffect(effect, "color", v);
			} catch (_unused8) {}
			return effect;
		}
		async decorate(target, node) {
			var _node$fills, _node$strokes, _node$effects;
			if (target.type !== "TEXT") target.fills = ((_node$fills = node.fills) !== null && _node$fills !== void 0 ? _node$fills : []).map((f) => this.fill(f)).filter(Boolean);
			const s = (_node$strokes = node.strokes) === null || _node$strokes === void 0 ? void 0 : _node$strokes[0];
			if (s) {
				target.strokes = [_objectSpread2(_objectSpread2({}, this.paint(s.paint)), {}, { visible: s.visible })];
				if (typeof s.weight === "number") target.strokeWeight = s.weight;
				else [
					"strokeTopWeight",
					"strokeRightWeight",
					"strokeBottomWeight",
					"strokeLeftWeight"
				].forEach((side, i) => target[side] = s.weight[i]);
				target.strokeAlign = s.align;
				target.dashPattern = s.dash;
			} else if ("strokes" in target) target.strokes = [];
			if (target.type !== "TEXT") {
				var _node$cornerSmoothing;
				CORNERS.forEach((corner, i) => {
					var _node$radius$i, _node$radius, _node$radiusVariables;
					target[corner] = (_node$radius$i = (_node$radius = node.radius) === null || _node$radius === void 0 ? void 0 : _node$radius[i]) !== null && _node$radius$i !== void 0 ? _node$radius$i : 0;
					this.bind(target, corner, (_node$radiusVariables = node.radiusVariables) === null || _node$radiusVariables === void 0 ? void 0 : _node$radiusVariables[i]);
				});
				target.cornerSmoothing = (_node$cornerSmoothing = node.cornerSmoothing) !== null && _node$cornerSmoothing !== void 0 ? _node$cornerSmoothing : 0;
			}
			const style = node.effectStyle && this.effectStyles.get(node.effectStyle);
			if (style) await target.setEffectStyleIdAsync(style.id);
			else target.effects = ((_node$effects = node.effects) !== null && _node$effects !== void 0 ? _node$effects : []).map((e) => this.effect(e));
		}
		layer(target, node) {
			var _node$opacity, _node$blendMode;
			target.visible = node.visible !== false;
			target.locked = !!node.locked;
			target.opacity = (_node$opacity = node.opacity) !== null && _node$opacity !== void 0 ? _node$opacity : 1;
			target.blendMode = (_node$blendMode = node.blendMode) !== null && _node$blendMode !== void 0 ? _node$blendMode : target.type === "FRAME" || target.type === "COMPONENT" ? "PASS_THROUGH" : "NORMAL";
		}
		place(c, child, parentLayout) {
			if (parentLayout && child.absolute) {
				try {
					c.layoutPositioning = "ABSOLUTE";
					c.constraints = {
						horizontal: child.absolute.h,
						vertical: child.absolute.v
					};
				} catch (_unused9) {
					this.warnings.add(`Position absolue impossible sur ${child.name}.`);
				}
				c.x = child.x;
				c.y = child.y;
			} else if (parentLayout) this.size(c, child);
			else {
				c.x = child.x;
				c.y = child.y;
			}
			for (const [field, value] of [
				["minWidth", child.minW],
				["maxWidth", child.maxW],
				["minHeight", child.minH],
				["maxHeight", child.maxH]
			]) if (value !== void 0) try {
				c[field] = value;
			} catch (_unused10) {}
			if (child.rotation) c.rotation = child.rotation;
		}
		async build(node, target) {
			if (!target && node.instanceOf) {
				const instance = await this.instance(node);
				if (instance) return instance;
			}
			if (!target && node.text && (node.kind === "TEXT" || !node.kind)) return this.text(node);
			if (!target && node.kind === "VECTOR" && node.svg) try {
				const v = figma.createNodeFromSvg(node.svg);
				v.name = node.name;
				v.resize(Math.max(1, node.w), Math.max(1, node.h));
				this.layer(v, node);
				this.refer(v, node);
				return v;
			} catch (_unused11) {
				this.warnings.add(`Vecteur ${node.name} non importé : cadre vide.`);
			}
			const frame = target !== null && target !== void 0 ? target : node.kind === "RECTANGLE" && !node.children.length ? figma.createRectangle() : figma.createFrame();
			if (target) for (const c of frame.children.slice()) c.remove();
			frame.name = node.name;
			if ("clipsContent" in frame) frame.clipsContent = !!node.clip;
			await this.decorate(frame, node);
			this.layer(frame, node);
			const l = node.layout;
			if (l && frame.type !== "RECTANGLE") {
				frame.layoutMode = l.direction;
				frame.layoutWrap = l.wrap ? "WRAP" : "NO_WRAP";
				frame.itemSpacing = l.primary === "SPACE_BETWEEN" ? 0 : l.gap;
				if (l.primary !== "SPACE_BETWEEN") this.bind(frame, "itemSpacing", l.gapVariable);
				if (l.wrap && l.counterGap !== void 0) {
					frame.counterAxisSpacing = l.counterGap;
					this.bind(frame, "counterAxisSpacing", l.counterGapVariable);
				}
				[
					"paddingTop",
					"paddingRight",
					"paddingBottom",
					"paddingLeft"
				].forEach((side, i) => {
					frame[side] = l.padding[i];
					this.bind(frame, side, l.paddingVariables[i]);
				});
				frame.primaryAxisAlignItems = l.primary;
				frame.counterAxisAlignItems = l.counter;
				frame.itemReverseZIndex = l.reverseZ;
			} else if (frame.type !== "RECTANGLE") frame.layoutMode = "NONE";
			frame.resize(Math.max(1, node.w), Math.max(1, node.h));
			for (const child of node.children) {
				const c = await this.build(child);
				frame.appendChild(c);
				this.place(c, child, !!l);
			}
			if (l) try {
				frame.layoutSizingHorizontal = node.sizingH === "HUG" ? "HUG" : "FIXED";
				frame.layoutSizingVertical = node.sizingV === "HUG" ? "HUG" : "FIXED";
			} catch (_unused12) {}
			this.refer(frame, node);
			return frame;
		}
		size(c, node) {
			const hugOk = c.type === "TEXT" || c.layoutMode && c.layoutMode !== "NONE" || c.type === "INSTANCE";
			const pick = (s) => s === "HUG" && !hugOk ? "FIXED" : s;
			try {
				c.layoutSizingHorizontal = pick(node.sizingH);
				c.layoutSizingVertical = pick(node.sizingV);
			} catch (_unused13) {
				this.warnings.add(`Dimensionnement auto layout impossible sur ${node.name}.`);
			}
		}
		refer(target, node) {
			if (node.refs && Object.keys(node.refs).length) this.bindings.push({
				target,
				refs: node.refs
			});
		}
		async text(node) {
			const t = node.text;
			const text = figma.createText();
			text.fontName = await this.font(t.fontFamily, t.fontWeight);
			text.characters = t.characters;
			text.name = node.name || t.characters.slice(0, 40);
			text.fontSize = t.fontSize;
			text.lineHeight = lineHeight(t.lineHeight);
			text.letterSpacing = {
				value: t.letterSpacing,
				unit: "PIXELS"
			};
			text.textAlignHorizontal = t.align;
			text.textAlignVertical = t.valign;
			text.textCase = t.textCase;
			text.textDecoration = t.decoration;
			const style = t.style && this.textStyles.get(t.style);
			if (style) await text.setTextStyleIdAsync(style.id);
			else {
				this.bind(text, "fontSize", t.fontSizeVariable);
				if (text.fontName.family === t.fontFamily) this.bind(text, "fontFamily", t.fontFamilyVariable);
			}
			text.fills = [this.paint(t.color)];
			if (t.autoResize === "WIDTH_AND_HEIGHT") text.textAutoResize = "WIDTH_AND_HEIGHT";
			else {
				text.resize(Math.max(1, node.w), Math.max(1, node.h));
				text.textAutoResize = t.autoResize === "HEIGHT" ? "HEIGHT" : "NONE";
			}
			if (t.autoResize === "TRUNCATE") {
				text.textTruncation = "ENDING";
				if (t.maxLines) text.maxLines = t.maxLines;
			}
			this.layer(text, node);
			this.refer(text, node);
			return text;
		}
		async instance(node) {
			var _this$components$get;
			const comp = (_this$components$get = this.components.get(node.instanceOf)) !== null && _this$components$get !== void 0 ? _this$components$get : this.found(node.instanceOf, "COMPONENT");
			if (!comp) return null;
			const instance = comp.createInstance();
			instance.name = node.name;
			await this.overrides(instance, node, true);
			if (node.propValues) this.pendingProps.push({
				instance,
				values: node.propValues
			});
			this.refer(instance, node);
			return instance;
		}
		async overrides(target, node, root = false) {
			var _target$children;
			if (node.overridden) {
				var _node$opacity2;
				if (target.type === "TEXT" && node.text) {
					if (target.fontName !== figma.mixed) await figma.loadFontAsync(target.fontName);
					if (target.characters !== node.text.characters) target.characters = node.text.characters;
					target.fills = [this.paint(node.text.color)];
					if (target.fontSize !== node.text.fontSize) {
						target.fontSize = node.text.fontSize;
						this.bind(target, "fontSize", node.text.fontSizeVariable);
					}
				} else await this.decorate(target, node);
				if (!root) target.visible = node.visible !== false;
				target.opacity = (_node$opacity2 = node.opacity) !== null && _node$opacity2 !== void 0 ? _node$opacity2 : 1;
				const l = node.layout;
				if (l && target.layoutMode && target.layoutMode !== "NONE") [
					"paddingTop",
					"paddingRight",
					"paddingBottom",
					"paddingLeft"
				].forEach((side, i) => {
					target[side] = l.padding[i];
					this.bind(target, side, l.paddingVariables[i]);
				});
			}
			const kids = (_target$children = target.children) !== null && _target$children !== void 0 ? _target$children : [];
			if (kids.length !== node.children.length) {
				if (node.children.length) this.warnings.add(`Instance ${node.name} : structure différente du composant, overrides internes ignorés.`);
				return;
			}
			for (let i = 0; i < kids.length; i++) {
				const child = node.children[i];
				if (child.instanceOf && child.propValues && kids[i].type === "INSTANCE") this.pendingProps.push({
					instance: kids[i],
					values: child.propValues
				});
				await this.overrides(kids[i], child);
			}
		}
		found(key, type) {
			const n = this.index.get(key);
			return n && n.type === type && !n.removed ? n : null;
		}
		properties(def, comp, bindings) {
			var _comp$parent;
			const holder = ((_comp$parent = comp.parent) === null || _comp$parent === void 0 ? void 0 : _comp$parent.type) === "COMPONENT_SET" ? comp.parent : comp;
			const keyOf = (name) => {
				var _holder$componentProp;
				return Object.keys((_holder$componentProp = holder.componentPropertyDefinitions) !== null && _holder$componentProp !== void 0 ? _holder$componentProp : {}).find((k) => k.split("#")[0] === name);
			};
			for (const p of def.properties) {
				if (keyOf(p.name)) continue;
				let value = p.default;
				if (p.type === "INSTANCE_SWAP") {
					var _this$components$get2;
					const c = (_this$components$get2 = this.components.get(String(value))) !== null && _this$components$get2 !== void 0 ? _this$components$get2 : this.found(String(value), "COMPONENT");
					if (!c) {
						this.warnings.add(`Propriété « ${p.name} » : composant par défaut introuvable.`);
						continue;
					}
					value = c.id;
				}
				try {
					holder.addComponentProperty(p.name, p.type, value);
				} catch (_unused14) {
					this.warnings.add(`Propriété « ${p.name} » non créée sur ${def.name}.`);
				}
			}
			const FIELD = {
				characters: "characters",
				visible: "visible",
				mainComponent: "mainComponent"
			};
			for (const b of bindings) {
				const refs = {};
				for (const [field, name] of Object.entries(b.refs)) {
					const key = name && keyOf(name);
					if (key) refs[FIELD[field]] = key;
				}
				if (!Object.keys(refs).length) continue;
				try {
					b.target.componentPropertyReferences = _objectSpread2(_objectSpread2({}, b.target.componentPropertyReferences), refs);
				} catch (_unused15) {
					this.warnings.add(`Liaison de propriété impossible sur ${b.target.name}.`);
				}
			}
		}
		applyProps() {
			for (const { instance, values } of this.pendingProps.splice(0)) {
				var _instance$componentPr;
				const defs = (_instance$componentPr = instance.componentProperties) !== null && _instance$componentPr !== void 0 ? _instance$componentPr : {};
				const out = {};
				for (const [name, v] of Object.entries(values)) {
					const key = Object.keys(defs).find((k) => k.split("#")[0] === name);
					if (!key) continue;
					if (defs[key].type === "INSTANCE_SWAP") {
						var _this$components$get3;
						const c = (_this$components$get3 = this.components.get(String(v))) !== null && _this$components$get3 !== void 0 ? _this$components$get3 : this.found(String(v), "COMPONENT");
						if (c) out[key] = c.id;
					} else out[key] = v;
				}
				if (!Object.keys(out).length) continue;
				try {
					instance.setProperties(out);
				} catch (_unused16) {
					this.warnings.add(`Propriétés non appliquées sur ${instance.name}.`);
				}
			}
		}
		async componentDefs(update) {
			const defs = this.payload.components;
			const order = [];
			const visit = (d, seen = /* @__PURE__ */ new Set()) => {
				if (order.includes(d) || seen.has(d.id)) return;
				seen.add(d.id);
				const deps = [];
				(function collect(n) {
					if (n.instanceOf) deps.push(n.instanceOf);
					n.children.forEach(collect);
				})(d.root);
				for (const dep of deps) {
					const def = defs.find((x) => x.id === dep);
					if (def) visit(def, seen);
				}
				order.push(d);
			};
			defs.forEach((d) => visit(d));
			const sets = /* @__PURE__ */ new Map();
			const built = [];
			for (const def of order) {
				var _def$variant, _def$variant2, _sets$get;
				await this.tick(`Composant ${(_def$variant = def.variant) !== null && _def$variant !== void 0 ? _def$variant : def.name}`);
				let comp = this.found(def.id, "COMPONENT");
				if (comp && !update) {
					this.components.set(def.id, comp);
					continue;
				}
				const isNew = !comp;
				if (!comp) {
					comp = figma.createComponent();
					this.page.appendChild(comp);
				}
				const before = this.bindings.length;
				await this.build(_objectSpread2(_objectSpread2({}, def.root), {}, { instanceOf: void 0 }), comp);
				built.push({
					def,
					comp,
					bindings: this.bindings.splice(before)
				});
				comp.name = (_def$variant2 = def.variant) !== null && _def$variant2 !== void 0 ? _def$variant2 : def.name;
				this.mark(comp, def.id, isNew);
				this.components.set(def.id, comp);
				if (def.set) sets.set(def.set, [...(_sets$get = sets.get(def.set)) !== null && _sets$get !== void 0 ? _sets$get : [], comp]);
			}
			for (const [name, members] of sets) {
				let set = this.found("set/" + name, "COMPONENT_SET");
				const isNew = !set;
				if (!set) set = figma.combineAsVariants(members, this.page);
				else for (const m of members) if (m.parent !== set) set.appendChild(m);
				set.name = name;
				set.layoutMode = "HORIZONTAL";
				set.layoutWrap = "WRAP";
				set.itemSpacing = 24;
				set.counterAxisSpacing = 24;
				set.paddingTop = set.paddingRight = set.paddingBottom = set.paddingLeft = 24;
				set.primaryAxisSizingMode = "AUTO";
				set.counterAxisSizingMode = "AUTO";
				this.mark(set, "set/" + name, isNew);
			}
			for (const b of built) this.properties(b.def, b.comp, b.bindings);
			this.applyProps();
		}
		async board(key, title) {
			let board = this.found(key, "FRAME");
			const isNew = !board;
			if (!board) {
				board = figma.createFrame();
				this.page.appendChild(board);
				const right = this.page.children.filter((n) => n !== board).reduce((m, n) => Math.max(m, n.x + n.width), -200);
				board.x = right + 200;
				board.y = 0;
			}
			board.name = title;
			board.layoutMode = "VERTICAL";
			board.itemSpacing = 24;
			board.paddingTop = board.paddingRight = board.paddingBottom = board.paddingLeft = 40;
			board.fills = [{
				type: "SOLID",
				color: {
					r: 1,
					g: 1,
					b: 1
				}
			}];
			board.cornerRadius = 16;
			board.layoutSizingHorizontal = "HUG";
			board.layoutSizingVertical = "HUG";
			let heading = board.children.find((c) => c.getPluginData(PLUGIN_DATA_KEY) === key + "/title");
			if (!heading) {
				heading = figma.createText();
				heading.fontName = await this.font("Inter", 700);
				heading.setPluginData(PLUGIN_DATA_KEY, key + "/title");
				board.insertChild(0, heading);
			}
			heading.characters = title;
			heading.fontSize = 32;
			let content = board.children.find((c) => c.getPluginData(PLUGIN_DATA_KEY) === key + "/content");
			if (!content) {
				content = figma.createFrame();
				content.setPluginData(PLUGIN_DATA_KEY, key + "/content");
				board.appendChild(content);
			}
			content.name = "Contenu";
			content.fills = [];
			content.layoutMode = "HORIZONTAL";
			content.layoutWrap = "WRAP";
			content.itemSpacing = 24;
			content.counterAxisSpacing = 24;
			content.resize(1100, 100);
			content.layoutSizingHorizontal = "FIXED";
			content.layoutSizingVertical = "HUG";
			this.mark(board, key, isNew);
			this.touched.push(board);
			return content;
		}
		async label(characters, size = 12, weight = 400) {
			const t = figma.createText();
			t.fontName = await this.font("Inter", weight);
			t.characters = characters;
			t.fontSize = size;
			return t;
		}
		async boards() {
			const vars = this.payload.variables;
			await this.tick("Planche Couleurs");
			let content = await this.board("board/colors", "Couleurs");
			for (const c of content.children.slice()) c.remove();
			for (const v of vars.filter((v) => v.type === "COLOR")) {
				const cell = figma.createFrame();
				cell.name = v.name;
				cell.fills = [];
				cell.layoutMode = "VERTICAL";
				cell.itemSpacing = 8;
				const swatch = figma.createRectangle();
				swatch.resize(160, 96);
				swatch.cornerRadius = 12;
				swatch.fills = [this.paint({
					hex: String(v.value),
					opacity: 1,
					variable: v.token
				})];
				cell.appendChild(swatch);
				cell.appendChild(await this.label(v.name, 12, 600));
				cell.appendChild(await this.label(String(v.value)));
				cell.layoutSizingHorizontal = "HUG";
				cell.layoutSizingVertical = "HUG";
				content.appendChild(cell);
			}
			await this.tick("Planche Typographie");
			content = await this.board("board/typography", "Typographie");
			for (const c of content.children.slice()) c.remove();
			content.layoutMode = "VERTICAL";
			for (const s of this.payload.textStyles) {
				const style = this.textStyles.get(s.id);
				const sample = await this.label(`${s.name.replace("DS-Studio/", "")} — ${s.sample}`);
				if (style) await sample.setTextStyleIdAsync(style.id);
				content.appendChild(sample);
			}
			await this.tick("Planche Espacements");
			content = await this.board("board/spacing", "Espacements");
			for (const c of content.children.slice()) c.remove();
			content.layoutMode = "VERTICAL";
			for (const v of vars.filter((v) => v.category === "space" || v.category === "radius")) {
				const row = figma.createFrame();
				row.name = v.name;
				row.fills = [];
				row.layoutMode = "HORIZONTAL";
				row.itemSpacing = 16;
				row.counterAxisAlignItems = "CENTER";
				const bar = figma.createRectangle();
				bar.resize(Math.max(1, Number(v.value)), 24);
				bar.fills = [this.paint({
					hex: "#3154C4",
					opacity: 1,
					variable: "color.brand"
				})];
				if (v.category === "radius") {
					bar.resize(96, 48);
					bar.cornerRadius = Number(v.value);
					this.bind(bar, "topLeftRadius", v.token);
					this.bind(bar, "topRightRadius", v.token);
					this.bind(bar, "bottomLeftRadius", v.token);
					this.bind(bar, "bottomRightRadius", v.token);
				} else this.bind(bar, "width", v.token);
				row.appendChild(bar);
				row.appendChild(await this.label(`${v.name} · ${v.value} px`));
				row.layoutSizingHorizontal = "HUG";
				row.layoutSizingVertical = "HUG";
				content.appendChild(row);
			}
			await this.tick("Planche Composants");
			content = await this.board("board/components", "Composants");
			for (const def of this.payload.components) {
				var _comp$parent2;
				const comp = this.components.get(def.id);
				if (!comp) continue;
				const top = ((_comp$parent2 = comp.parent) === null || _comp$parent2 === void 0 ? void 0 : _comp$parent2.type) === "COMPONENT_SET" ? comp.parent : comp;
				if (top.parent === this.page) content.appendChild(top);
			}
		}
		async screen(screen) {
			await this.tick(`Écran ${screen.name}`);
			let frame = this.found(screen.id, "FRAME");
			const isNew = !frame;
			if (!frame) {
				frame = figma.createFrame();
				this.page.appendChild(frame);
				const right = this.page.children.filter((n) => n !== frame).reduce((m, n) => Math.max(m, n.x + n.width), -200);
				frame.x = right + 200;
				frame.y = 0;
			}
			await this.build(_objectSpread2(_objectSpread2({}, screen.root), {}, { instanceOf: void 0 }), frame);
			this.bindings = [];
			this.applyProps();
			frame.name = screen.name;
			frame.clipsContent = true;
			this.mark(frame, screen.id, isNew);
			this.touched.push(frame);
			const fresh = [...this.components.values()].filter((c) => c.parent === this.page);
			if (fresh.length) {
				const content = await this.board("board/components", "Composants");
				for (const c of fresh) content.appendChild(c);
			}
		}
		async orphans() {
			var _collection$variableI;
			const p = this.payload;
			const expected = /* @__PURE__ */ new Set([
				...p.variables.map((v) => "var/" + v.token),
				...p.textStyles.map((s) => s.id),
				...p.effectStyles.map((s) => s.id),
				...p.components.map((c) => c.id),
				...p.components.filter((c) => c.set).map((c) => "set/" + c.set)
			]);
			const out = [];
			const check = (key, n) => {
				if (!key || expected.has(key) || /^(board|screen)\//.test(key)) return;
				if (/^(var|text|shadow|set)\//.test(key) || n.type === "COMPONENT") out.push({
					id: key,
					name: n.name
				});
			};
			for (const [key, n] of this.index) if (!n.removed) check(key, n);
			for (const s of await figma.getLocalTextStylesAsync()) check(s.getPluginData(PLUGIN_DATA_KEY), s);
			for (const s of await figma.getLocalEffectStylesAsync()) check(s.getPluginData(PLUGIN_DATA_KEY), s);
			const collection = (await figma.variables.getLocalVariableCollectionsAsync()).find((c) => c.name === COLLECTION_NAME);
			for (const id of (_collection$variableI = collection === null || collection === void 0 ? void 0 : collection.variableIds) !== null && _collection$variableI !== void 0 ? _collection$variableI : []) {
				const v = await figma.variables.getVariableByIdAsync(id);
				if (v) check(v.getPluginData(PLUGIN_DATA_KEY), v);
			}
			return out.filter((o, i) => out.findIndex((x) => x.id === o.id) === i).slice(0, 500);
		}
	};
	figma.ui.onmessage = async (msg) => {
		if (!msg || typeof msg.id !== "string") return;
		const run = commands[msg.command];
		try {
			if (!run) throw new Error("Commande inconnue : " + msg.command + ".");
			const result = await run(msg.params || {}, msg.id);
			post({
				id: msg.id,
				ok: true,
				result
			});
		} catch (e) {
			post({
				id: msg.id,
				ok: false,
				error: String(e && e.message || e)
			});
		}
	};
})();
