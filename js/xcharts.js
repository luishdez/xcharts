/**
 * xCharts 0.1.4 Copyright (c) 2012, tenXer, Inc. All Rights Reserved.
 * Available via the MIT license.
 * see: http://github.com/tenxer/xCharts for details
 */
(function () {


/**
 * almond 0.1.4 Copyright (c) 2011, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        aps = [].slice;

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);

                name = baseParts.concat(name.split("/"));

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            return req.apply(undef, aps.call(arguments, 0).concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (waiting.hasOwnProperty(name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!defined.hasOwnProperty(name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    function makeMap(name, relName) {
        var prefix, plugin,
            index = name.indexOf('!');

        if (index !== -1) {
            prefix = normalize(name.slice(0, index), relName);
            name = name.slice(index + 1);
            plugin = callDep(prefix);

            //Normalize according
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            p: plugin
        };
    }

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (typeof callback === 'function') {

            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = makeRequire(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = defined[name] = {};
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = {
                        id: name,
                        uri: '',
                        exports: defined[name],
                        config: makeConfig(name)
                    };
                } else if (defined.hasOwnProperty(depName) || waiting.hasOwnProperty(depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else if (!defining[depName]) {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback.apply(defined[name], args);

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 15);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        config = cfg;
        return req;
    };

    define = function (name, deps, callback) {

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        waiting[name] = [name, deps, callback];
    };

    define.amd = {
        jQuery: true
    };
}());

define("../node_modules/almond/almond", function(){});

/*!
 Lo-Dash 0.8.0 lodash.com/license
 Underscore.js 1.4.0 underscorejs.org/LICENSE
*/
;(function(e,t){function s(e){if(e&&e.__wrapped__)return e;if(!(this instanceof s))return new s(e);this.__wrapped__=e}function o(e,t,n){t||(t=0);var r=e.length,i=r-t>=(n||H),s=i?{}:e;if(i)for(var o=t-1;++o<r;)n=e[o]+"",(Q.call(s,n)?s[n]:s[n]=[]).push(e[o]);return function(e){if(i){var n=e+"";return Q.call(s,n)&&-1<x(s[n],e)}return-1<x(s,e,t)}}function u(e,n){var r=e.b,i=n.b,e=e.a,n=n.a;if(e!==n){if(e>n||e===t)return 1;if(e<n||n===t)return-1}return r<i?-1:1}function a(e,t,n){function r(){var u=arguments
,a=s?this:t;return i||(e=t[o]),n.length&&(u=u.length?n.concat(Z.call(u)):n),this instanceof r?(p.prototype=e.prototype,a=new p,(u=e.apply(a,u))&&Pt[typeof u]?u:a):e.apply(a,u)}var i=m(e),s=!n,o=e;return s&&(n=t),r}function f(e,n){return e?"function"!=typeof e?function(t){return t[e]}:n!==t?function(t,r,i){return e.call(n,t,r,i)}:e:A}function l(){for(var e,t,n,s=-1,o=arguments.length,a={e:"",p:"",c:{d:""},l:{d:""}};++s<o;)for(t in e=arguments[s],e)n=(n=e[t])==r?"":n,/d|h/.test(t)?("string"==typeof 
n&&(n={b:n,k:n}),a.c[t]=n.b||"",a.l[t]=n.k||""):a[t]=n;e=a.a,t=/^[^,]+/.exec(e)[0],n=a.i,s=a.r,a.f=t,a.g=wt,a.i=n==r?t:n,a.j=Ot,a.m=xt,a.o=J,a.q=a.q!==i,a.r=s==r?Mt:s,a.n==r&&(a.n=Ct);if("d"!=t||!a.c.h)a.c=r;t="",a.r&&(t+=""),t+="var j,B,k="+a.f+",u",a.i&&(t+="="+a.i),t+=";"+a.p+";",a.c&&(t+="var l=k.length;j=-1;",a.l&&(t+="if(l===+l){"),a.n&&(t+="if(z.call(k)==x){k=k.split('')}"),t+=a.c.d+";while(++j<l){B=k[j];"+a.c.h+"}",a.l&&(t+="}"));if(a.l){a.c?t+="else {":a.m&&(t+="var l=k.length;j=-1;if(l&&P(k)){while(++j<l){B=k[j+=''];"+
a.l.h+"}}else {"),a.g||(t+="var v=typeof k=='function'&&r.call(k,'prototype');");if(a.j&&a.q)t+="var o=-1,p=Z[typeof k]?m(k):[],l=p.length;"+a.l.d+";while(++o<l){j=p[o];",a.g||(t+="if(!(v&&j=='prototype')){"),t+="B=k[j];"+a.l.h+"",a.g||(t+="}");else{t+=a.l.d+";for(j in k){";if(!a.g||a.q)t+="if(",a.g||(t+="!(v&&j=='prototype')"),!a.g&&a.q&&(t+="&&"),a.q&&(t+="h.call(k,j)"),t+="){";t+="B=k[j];"+a.l.h+";";if(!a.g||a.q)t+="}"}t+="}";if(a.g){t+="var g=k.constructor;";for(n=0;7>n;n++)t+="j='"+a.o[n]+"';if("
,"constructor"==a.o[n]&&(t+="!(g&&g.prototype===k)&&"),t+="h.call(k,j)){B=k[j];"+a.l.h+"}"}if(a.c||a.m)t+="}"}return t+=a.e+";return u",Function("E,F,G,J,e,f,K,h,i,N,P,R,T,U,Y,Z,m,r,w,x,z,A","var H=function("+e+"){"+t+"};return H")(_t,_,L,u,K,f,Zt,Q,A,x,v,Vt,m,$t,vt,Pt,ot,Y,Z,gt,et)}function c(e){return"\\"+Ht[e]}function h(e){return Kt[e]}function p(){}function d(e){return Qt[e]}function v(e){return et.call(e)==lt}function m(e){return"function"==typeof e}function g(e){var t=i;if(!e||"object"!=typeof 
e||v(e))return t;var n=e.constructor;return(!kt||"function"==typeof e.toString||"string"!=typeof (e+""))&&(!m(n)||n instanceof n)?St?(Zt(e,function(e,n,r){return t=!Q.call(r,n),i}),t===i):(Zt(e,function(e,n){t=n}),t===i||Q.call(e,t)):t}function y(e,t,s,o,u){if(e==r)return e;s&&(t=i);if(s=Pt[typeof e]){var a=et.call(e);if(!Dt[a]||Tt&&v(e))return e;var f=a==ct,s=f||(a==vt?$t(e):s)}if(!s||!t)return s?f?Z.call(e):Yt({},e):e;s=e.constructor;switch(a){case ht:return new s(e==n);case pt:return new s(+e)
;case dt:case gt:return new s(e);case mt:return s(e.source,U.exec(e))}o||(o=[]),u||(u=[]);for(a=o.length;a--;)if(o[a]==e)return u[a];var l=f?s(a=e.length):{};o.push(e),u.push(l);if(f)for(f=-1;++f<a;)l[f]=y(e[f],t,r,o,u);else en(e,function(e,n){l[n]=y(e,t,r,o,u)});return l}function b(e,t,s,o){if(e==r||t==r)return e===t;if(e===t)return 0!==e||1/e==1/t;if(Pt[typeof e]||Pt[typeof t])e=e.__wrapped__||e,t=t.__wrapped__||t;var u=et.call(e);if(u!=et.call(t))return i;switch(u){case ht:case pt:return+e==+t
;case dt:return e!=+e?t!=+t:0==e?1/e==1/t:e==+t;case mt:case gt:return e==t+""}var a=_t[u];if(Tt&&!a&&(a=v(e))&&!v(t)||!a&&(u!=vt||kt&&("function"!=typeof e.toString&&"string"==typeof (e+"")||"function"!=typeof t.toString&&"string"==typeof (t+""))))return i;s||(s=[]),o||(o=[]);for(u=s.length;u--;)if(s[u]==e)return o[u]==t;var u=-1,f=n,l=0;s.push(e),o.push(t);if(a){l=e.length;if(f=l==t.length)for(;l--&&(f=b(e[l],t[l],s,o)););return f}a=e.constructor,f=t.constructor;if(a!=f&&(!m(a)||!(a instanceof 
a&&m(f)&&f instanceof f)))return i;for(var c in e)if(Q.call(e,c)&&(l++,!Q.call(t,c)||!b(e[c],t[c],s,o)))return i;for(c in t)if(Q.call(t,c)&&!(l--))return i;if(wt)for(;7>++u;)if(c=J[u],Q.call(e,c)&&(!Q.call(t,c)||!b(e[c],t[c],s,o)))return i;return n}function w(e,t,n,r){var s=e,o=e.length,u=3>arguments.length;if(o!==+o)var a=rn(e),o=a.length;else Ct&&et.call(e)==gt&&(s=e.split(""));return vn(e,function(e,f,l){f=a?a[--o]:--o,n=u?(u=i,s[f]):t.call(r,n,s[f],f,l)}),n}function E(e,t,n){return t==r||n?e[0
]:Z.call(e,0,t)}function S(e,t){for(var n,r=-1,i=e.length,s=[];++r<i;)n=e[r],Vt(n)?G.apply(s,t?n:S(n)):s.push(n);return s}function x(e,t,n){var r=-1,i=e.length;if(n){if("number"!=typeof n)return r=C(e,t),e[r]===t?r:-1;r=(0>n?ut(0,i+n):n)-1}for(;++r<i;)if(e[r]===t)return r;return-1}function T(e,t,n){for(var r=-Infinity,i=-1,s=e?e.length:0,o=r,t=f(t,n);++i<s;)n=t(e[i],i,e),n>r&&(r=n,o=e[i]);return o}function N(e,t,n){return Z.call(e,t==r||n?1:t)}function C(e,t,n,r){for(var i=0,s=e.length,n=f(n,r),t=
n(t);i<s;)r=i+s>>>1,n(e[r])<t?i=r+1:s=r;return i}function k(e,t,n,r){var s=-1,o=e.length,u=[],a=[];"function"==typeof t&&(r=n,n=t,t=i);for(n=f(n,r);++s<o;)if(r=n(e[s],s,e),t?!s||a[a.length-1]!==r:0>x(a,r))a.push(r),u.push(e[s]);return u}function L(e,t){return At||tt&&2<arguments.length?tt.call.apply(tt,arguments):a(e,t,Z.call(arguments,2))}function A(e){return e}function O(e){vn(tn(e),function(t){var r=s[t]=e[t];s.prototype[t]=function(){var e=[this.__wrapped__];return arguments.length&&G.apply(e
,arguments),e=r.apply(s,e),this.__chain__&&(e=new s(e),e.__chain__=n),e}})}var n=!0,r=null,i=!1,M="object"==typeof exports&&exports&&("object"==typeof global&&global&&global==global.global&&(e=global),exports),_=Array.prototype,D=Object.prototype,P=0,H=30,B=e._,j=/[-?+=!~*%&^<>|{(\/]|\[\D|\b(?:delete|in|instanceof|new|typeof|void)\b/,F=/&(?:amp|lt|gt|quot|#x27);/g,I=/\b__p\+='';/g,q=/\b(__p\+=)''\+/g,R=/(__e\(.*?\)|\b__t\))\+'';/g,U=/\w*$/,z=/(?:__e|__t=)\(\s*(?![\d\s"']|this\.)/g,W=RegExp("^"+(D
.valueOf+"").replace(/[.*+?^=!:${}()|[\]\/\\]/g,"\\$&").replace(/valueOf|for [^\]]+/g,".+?")+"$"),X=/($^)/,V=/[&<>"']/g,$=/['\n\r\t\u2028\u2029\\]/g,J="constructor hasOwnProperty isPrototypeOf propertyIsEnumerable toLocaleString toString valueOf".split(" "),K=_.concat,Q=D.hasOwnProperty,G=_.push,Y=D.propertyIsEnumerable,Z=_.slice,et=D.toString,tt=W.test(tt=Z.bind)&&tt,nt=Math.floor,rt=W.test(rt=Object.getPrototypeOf)&&rt,it=W.test(it=Array.isArray)&&it,st=e.isFinite,ot=W.test(ot=Object.keys)&&ot,
ut=Math.max,at=Math.min,ft=Math.random,lt="[object Arguments]",ct="[object Array]",ht="[object Boolean]",pt="[object Date]",dt="[object Number]",vt="[object Object]",mt="[object RegExp]",gt="[object String]",yt=e.clearTimeout,bt=e.setTimeout,wt,Et,St,xt=n;(function(){function e(){this.x=1}var t={0:1,length:1},n=[];e.prototype={valueOf:1,y:1};for(var r in new e)n.push(r);for(r in arguments)xt=!r;wt=4>(n+"").length,St="x"!=n[0],Et=(n.splice.call(t,0,1),t[0])})(1);var Tt=!v(arguments),Nt="x"!=Z.call("x"
)[0],Ct="xx"!="x"[0]+Object("x")[0];try{var kt=("[object Object]",et.call(e.document||0)==vt)}catch(Lt){}var At=tt&&/\n|Opera/.test(tt+et.call(e.opera)),Ot=ot&&/^.+$|true/.test(ot+!!e.attachEvent),Mt=!At,_t={};_t[ht]=_t[pt]=_t["[object Function]"]=_t[dt]=_t[vt]=_t[mt]=i,_t[lt]=_t[ct]=_t[gt]=n;var Dt={};Dt[lt]=Dt["[object Function]"]=i,Dt[ct]=Dt[ht]=Dt[pt]=Dt[dt]=Dt[vt]=Dt[mt]=Dt[gt]=n;var Pt={"boolean":i,"function":n,object:n,number:i,string:i,"undefined":i,unknown:n},Ht={"\\":"\\","'":"'","\n":"n"
,"\r":"r","	":"t","\u2028":"u2028","\u2029":"u2029"};s.templateSettings={escape:/<%-([\s\S]+?)%>/g,evaluate:/<%([\s\S]+?)%>/g,interpolate:/<%=([\s\S]+?)%>/g,variable:""};var Bt={a:"d,c,y",i:"d",p:"c=f(c,y)",h:"if(c(B,j,d)===false)return u"},jt={i:"{}",p:"c=f(c,y)",h:"var q=c(B,j,d);(h.call(u,q)?u[q]++:u[q]=1)"},Ft={i:"true",h:"if(!c(B,j,d))return!u"},It={q:i,r:i,a:"n",i:"n",p:"for(var a=1,b=arguments.length;a<b;a++){if(k=arguments[a]){",h:"u[j]=B",e:"}}"},qt={i:"[]",h:"c(B,j,d)&&u.push(B)"},Rt={p
:"c=f(c,y)"},Ut={h:{k:Bt.h}},zt={i:"",d:{b:"u=Array(l)",k:"u="+(Ot?"Array(l)":"[]")},h:{b:"u[j]=c(B,j,d)",k:"u"+(Ot?"[o]=":".push")+"(c(B,j,d))"}},Wt={q:i,a:"n,c,y",i:"{}",p:"var S=typeof c=='function';if(S)c=f(c,y);else var t=e.apply(F,arguments)",h:"if(S?!c(B,j,n):N(t,j)<0)u[j]=B"},Xt=l({a:"n",i:"{}",h:"u[B]=j"});Tt&&(v=function(e){return!!e&&!!Q.call(e,"callee")});var Vt=it||function(e){return et.call(e)==ct};m(/x/)&&(m=function(e){return"[object Function]"==et.call(e)});var $t=rt?function(e){
if(!e||"object"!=typeof e)return i;var t=e.valueOf,n="function"==typeof t&&(n=rt(t))&&rt(n);return n?e==n||rt(e)==n&&!v(e):g(e)}:g,Jt=l({a:"n",i:"[]",p:"if(!(n&&Z[typeof n]))throw TypeError()",h:"u.push(j)"}),Kt={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#x27;"},Qt=Xt(Kt),Gt=l(It,{h:"if(u[j]==null)"+It.h}),Yt=l(It),Zt=l(Bt,Rt,Ut,{q:i}),en=l(Bt,Rt,Ut),tn=l({q:i,a:"n",i:"[]",h:"if(T(B))u.push(j)",e:"u.sort()"}),nn=l({a:"B",i:"true",p:"if(!B)return u;var I=z.call(B),l=B.length;if(E[I]"+(Tt?"||P(B)"
:"")+"||(I==Y&&l===+l&&T(B.splice)))return!l",h:{k:"return false"}}),rn=ot?function(e){return"function"==typeof e&&Y.call(e,"prototype")?Jt(e):ot(e)}:Jt,sn=l(It,{a:"n,ee,O",p:"var Q,D=arguments,a=0;if(O==J){var b=2,ff=D[3],gg=D[4]}else var b=D.length,ff=[],gg=[];while(++a<b){if(k=D[a]){",h:"if((ee=B)&&((Q=R(ee))||U(ee))){var L=false,hh=ff.length;while(hh--)if(L=ff[hh]==ee)break;if(L){u[j]=gg[hh]}else {ff.push(ee);gg.push(B=(B=u[j])&&Q?(R(B)?B:[]):(U(B)?B:{}));u[j]=H(B,ee,J,ff,gg)}}else if(ee!=null)u[j]=ee"
}),on=l(Wt),un=l({a:"n",i:"[]",h:"u"+(Ot?"[o]=":".push")+"([j,B])"}),an=l(Wt,{p:"if(typeof c!='function'){var q,t=e.apply(F,arguments),l=t.length;for(j=1;j<l;j++){q=t[j];if(q in n)u[q]=n[q]}}else {c=f(c,y)",h:"if(c(B,j,n))u[j]=B",e:"}"}),fn=l({a:"n",i:"[]",h:"u.push(B)"}),ln=l({a:"d,ii",i:"false",n:i,d:{b:"if(z.call(d)==x)return d.indexOf(ii)>-1"},h:"if(B===ii)return true"}),cn=l(Bt,jt),hn=l(Bt,Ft),pn=l(Bt,qt),dn=l(Bt,Rt,{i:"",h:"if(c(B,j,d))return B"}),vn=l(Bt,Rt),mn=l(Bt,jt,{h:"var q=c(B,j,d);(h.call(u,q)?u[q]:u[q]=[]).push(B)"
}),gn=l(zt,{a:"d,V",p:"var D=w.call(arguments,2),S=typeof V=='function'",h:{b:"u[j]=(S?V:B[V]).apply(B,D)",k:"u"+(Ot?"[o]=":".push")+"((S?V:B[V]).apply(B,D))"}}),yn=l(Bt,zt),bn=l(zt,{a:"d,cc",h:{b:"u[j]=B[cc]",k:"u"+(Ot?"[o]=":".push")+"(B[cc])"}}),wn=l({a:"d,c,C,y",i:"C",p:"var W=arguments.length<3;c=f(c,y)",d:{b:"if(W)u=k[++j]"},h:{b:"u=c(u,B,j,d)",k:"u=W?(W=false,B):c(u,B,j,d)"}}),En=l(Bt,qt,{h:"!"+qt.h}),Sn=l(Bt,Ft,{i:"false",h:Ft.h.replace("!","")}),xn=l(Bt,jt,zt,{h:{b:"u[j]={a:c(B,j,d),b:j,c:B}"
,k:"u"+(Ot?"[o]=":".push")+"({a:c(B,j,d),b:j,c:B})"},e:"u.sort(J);l=u.length;while(l--)u[l]=u[l].c"}),Tn=l(qt,{a:"d,bb",p:"var t=[];K(bb,function(B,q){t.push(q)});var dd=t.length",h:"for(var q,aa=true,s=0;s<dd;s++){q=t[s];if(!(aa=B[q]===bb[q]))break}aa&&u.push(B)"}),Nn=l({q:i,r:i,a:"n",p:"var M=arguments,l=M.length;if(l>1){for(var j=1;j<l;j++)u[M[j]]=G(u[M[j]],u);return u}",h:"if(T(u[j]))u[j]=G(u[j],u)"});s.VERSION="0.8.0",s.after=function(e,t){return 1>e?t():function(){if(1>--e)return t.apply(this
,arguments)}},s.bind=L,s.bindAll=Nn,s.chain=function(e){return e=new s(e),e.__chain__=n,e},s.clone=y,s.compact=function(e){for(var t=-1,n=e.length,r=[];++t<n;)e[t]&&r.push(e[t]);return r},s.compose=function(){var e=arguments;return function(){for(var t=arguments,n=e.length;n--;)t=[e[n].apply(this,t)];return t[0]}},s.contains=ln,s.countBy=cn,s.debounce=function(e,t,n){function i(){a=r,n||(o=e.apply(u,s))}var s,o,u,a;return function(){var r=n&&!a;return s=arguments,u=this,yt(a),a=bt(i,t),r&&(o=e.apply
(u,s)),o}},s.defaults=Gt,s.defer=function(e){var n=Z.call(arguments,1);return bt(function(){return e.apply(t,n)},1)},s.delay=function(e,n){var r=Z.call(arguments,2);return bt(function(){return e.apply(t,r)},n)},s.difference=function(e){for(var t=-1,n=e.length,r=K.apply(_,arguments),r=o(r,n),i=[];++t<n;)r(e[t])||i.push(e[t]);return i},s.escape=function(e){return e==r?"":(e+"").replace(V,h)},s.every=hn,s.extend=Yt,s.filter=pn,s.find=dn,s.first=E,s.flatten=S,s.forEach=vn,s.forIn=Zt,s.forOwn=en,s.functions=
tn,s.groupBy=mn,s.has=function(e,t){return Q.call(e,t)},s.identity=A,s.indexOf=x,s.initial=function(e,t,n){return Z.call(e,0,-(t==r||n?1:t))},s.intersection=function(e){var t,n=arguments.length,r=[],i=-1,s=e.length,u=[];e:for(;++i<s;)if(t=e[i],0>x(u,t)){for(var a=1;a<n;a++)if(!(r[a]||(r[a]=o(arguments[a])))(t))continue e;u.push(t)}return u},s.invert=Xt,s.invoke=gn,s.isArguments=v,s.isArray=Vt,s.isBoolean=function(e){return e===n||e===i||et.call(e)==ht},s.isDate=function(e){return et.call(e)==pt},
s.isElement=function(e){return e?1===e.nodeType:i},s.isEmpty=nn,s.isEqual=b,s.isFinite=function(e){return st(e)&&et.call(e)==dt},s.isFunction=m,s.isNaN=function(e){return et.call(e)==dt&&e!=+e},s.isNull=function(e){return e===r},s.isNumber=function(e){return et.call(e)==dt},s.isObject=function(e){return e?Pt[typeof e]:i},s.isPlainObject=$t,s.isRegExp=function(e){return et.call(e)==mt},s.isString=function(e){return et.call(e)==gt},s.isUndefined=function(e){return e===t},s.keys=rn,s.last=function(e
,t,n){var i=e.length;return t==r||n?e[i-1]:Z.call(e,-t||i)},s.lastIndexOf=function(e,t,n){var r=e.length;for(n&&"number"==typeof n&&(r=(0>n?ut(0,r+n):at(n,r-1))+1);r--;)if(e[r]===t)return r;return-1},s.lateBind=function(e,t){return a(t,e,Z.call(arguments,2))},s.map=yn,s.max=T,s.memoize=function(e,t){var n={};return function(){var r=t?t.apply(this,arguments):arguments[0];return Q.call(n,r)?n[r]:n[r]=e.apply(this,arguments)}},s.merge=sn,s.min=function(e,t,n){for(var r=Infinity,i=-1,s=e?e.length:0,o=
r,t=f(t,n);++i<s;)n=t(e[i],i,e),n<r&&(r=n,o=e[i]);return o},s.mixin=O,s.noConflict=function(){return e._=B,this},s.object=function(e,t){for(var n=-1,r=e.length,i={};++n<r;)t?i[e[n]]=t[n]:i[e[n][0]]=e[n][1];return i},s.omit=on,s.once=function(e){var t,s=i;return function(){return s?t:(s=n,t=e.apply(this,arguments),e=r,t)}},s.pairs=un,s.partial=function(e){return a(e,Z.call(arguments,1))},s.pick=an,s.pluck=bn,s.random=function(e,t){return e==r&&t==r&&(t=1),e=+e||0,t==r&&(t=e,e=0),e+nt(ft()*((+t||0)-
e+1))},s.range=function(e,t,n){e=+e||0,n=+n||1,t==r&&(t=e,e=0);for(var i=-1,t=ut(0,Math.ceil((t-e)/n)),s=Array(t);++i<t;)s[i]=e,e+=n;return s},s.reduce=wn,s.reduceRight=w,s.reject=En,s.rest=N,s.result=function(e,t){var n=e?e[t]:r;return m(n)?e[t]():n},s.shuffle=function(e){for(var t,n=-1,r=e.length,i=Array(r);++n<r;)t=nt(ft()*(n+1)),i[n]=i[t],i[t]=e[n];return i},s.size=function(e){var t=e?e.length:0;return t===+t?t:rn(e).length},s.some=Sn,s.sortBy=xn,s.sortedIndex=C,s.tap=function(e,t){return t(e
),e},s.template=function(e,t,n){n||(n={});var r,i,o=0,u=s.templateSettings,a="__p += '",f=n.variable||u.variable,l=f;e.replace(RegExp((n.escape||u.escape||X).source+"|"+(n.interpolate||u.interpolate||X).source+"|"+(n.evaluate||u.evaluate||X).source+"|$","g"),function(t,n,i,s,u){a+=e.slice(o,u).replace($,c),a+=n?"'+__e("+n+")+'":s?"';"+s+";__p+='":i?"'+((__t=("+i+"))==null?'':__t)+'":"",r||(r=s||j.test(n||i)),o=u+t.length}),a+="';",l||(f="obj",r?a="with("+f+"){"+a+"}":(n=RegExp("(\\(\\s*)"+f+"\\."+
f+"\\b","g"),a=a.replace(z,"$&"+f+".").replace(n,"$1__d"))),a=(r?a.replace(I,""):a).replace(q,"$1").replace(R,"$1;"),a="function("+f+"){"+(l?"":f+"||("+f+"={});")+"var __t,__p='',__e=_.escape"+(r?",__j=Array.prototype.join;function print(){__p+=__j.call(arguments,'')}":(l?"":",__d="+f+"."+f+"||"+f)+";")+a+"return __p}";try{i=Function("_","return "+a)(s)}catch(h){throw h.source=a,h}return t?i(t):(i.source=a,i)},s.throttle=function(e,t){function n(){a=new Date,u=r,s=e.apply(o,i)}var i,s,o,u,a=0;return function(
){var r=new Date,f=t-(r-a);return i=arguments,o=this,0>=f?(a=r,s=e.apply(o,i)):u||(u=bt(n,f)),s}},s.times=function(e,t,n){for(var e=+e||0,r=-1,i=Array(e);++r<e;)i[r]=t.call(n,r);return i},s.toArray=function(e){var t=e?e.length:0;return t===+t?(Nt?et.call(e)==gt:"string"==typeof e)?e.split(""):Z.call(e):fn(e)},s.unescape=function(e){return e==r?"":(e+"").replace(F,d)},s.union=function(){for(var e=-1,t=K.apply(_,arguments),n=t.length,r=[];++e<n;)0>x(r,t[e])&&r.push(t[e]);return r},s.uniq=k,s.uniqueId=
function(e){var t=P++;return e?e+t:t},s.values=fn,s.where=Tn,s.without=function(e){for(var t=-1,n=e.length,r=o(arguments,1,20),i=[];++t<n;)r(e[t])||i.push(e[t]);return i},s.wrap=function(e,t){return function(){var n=[e];return arguments.length&&G.apply(n,arguments),t.apply(this,n)}},s.zip=function(e){for(var t=-1,n=T(bn(arguments,"length")),r=Array(n);++t<n;)r[t]=bn(arguments,t);return r},s.all=hn,s.any=Sn,s.collect=yn,s.detect=dn,s.drop=N,s.each=vn,s.foldl=wn,s.foldr=w,s.head=E,s.include=ln,s.inject=
wn,s.methods=tn,s.select=pn,s.tail=N,s.take=E,s.unique=k,O(s),s.prototype.chain=function(){return this.__chain__=n,this},s.prototype.value=function(){return this.__wrapped__},vn("pop push reverse shift sort splice unshift".split(" "),function(e){var t=_[e];s.prototype[e]=function(){var e=this.__wrapped__;return t.apply(e,arguments),Et&&e.length===0&&delete e[0],this.__chain__&&(e=new s(e),e.__chain__=n),e}}),vn(["concat","join","slice"],function(e){var t=_[e];s.prototype[e]=function(){var e=t.apply
(this.__wrapped__,arguments);return this.__chain__&&(e=new s(e),e.__chain__=n),e}}),typeof define=="function"&&typeof define.amd=="object"&&define.amd?(e._=s,define('lodash',[],function(){return s})):M?"object"==typeof module&&module&&module.exports==M?(module.exports=s)._=s:M._=s:e._=s})(this);
define('scales',['lodash'], function (_) {
  var local = this,
    defaultSpacing = 0.25;

  function _getDomain(data, axis) {
    return _.chain(data)
      .pluck('data')
      .flatten()
      .pluck(axis)
      .uniq()
      .filter(function (d) {
        return d !== undefined && d !== null;
      })
      .value()
      .sort(d3.ascending);
  }

  function _extendDomain(domain, axis) {
    var min = domain[0],
      max = domain[1],
      diff,
      e;

    if (min === max) {
      e = Math.max(Math.round(min / 10), 4);
      min -= e;
      max += e;
    }

    diff = max - min;
    min = (min) ? min - (diff / 10) : min;
    min = (domain[0] > 0) ? Math.max(min, 0) : min;
    max = (max) ? max + (diff / 10) : max;
    max = (domain[1] < 0) ? Math.min(max, 0) : max;

    return [min, max];
  }

  function ordinal(data, axis, bounds, spacing) {
    spacing = spacing || defaultSpacing;
    var domain = _getDomain(data, axis);
    return d3.scale.ordinal()
      .domain(domain)
      .rangeRoundBands(bounds, spacing);
  }

  function linear(extents, bounds, axis) {
    if (axis === 'y') {
      extents = _extendDomain(extents, axis);
    }

    return d3.scale.linear()
      .domain(extents)
      .nice()
      .rangeRound(bounds);
  }

  function exponential(extents, bounds, axis) {
    if (axis === 'y') {
      extents = _extendDomain(extents, axis);
    }

    return d3.scale.pow()
      .exponent(0.65)
      .domain(extents)
      .nice()
      .rangeRound(bounds);
  }

  function time(extents, bounds) {
    return d3.time.scale()
      .domain(_.map(extents, function (d) { return new Date(d); }))
      .range(bounds);
  }

  function _getExtents(data, key) {
    var nData = _.chain(data)
      .pluck('data')
      .flatten()
      .value();

    return {
      x: d3.extent(nData, function (d) { return d.x; }),
      y: d3.extent(nData, function (d) { return d.y; })
    };
  }

  function xy(self, data, xType, yType) {
    var extents = _getExtents(data),
      scales = {},
      o = self._options,
      horiz = [o.axisPaddingLeft, self._width],
      vert = [self._height, o.axisPaddingTop],
      xScale,
      yScale;

    _.each([xType, yType], function (type, i) {
      var axis = (i === 0) ? 'x' : 'y',
        bounds = (i === 0) ? horiz : vert;
      switch (type) {
      case 'ordinal':
        scales[axis] = ordinal(data, axis, bounds);
        break;
      case 'linear':
        scales[axis] = linear(extents[axis], bounds, axis);
        break;
      case 'exponential':
        scales[axis] = exponential(extents[axis], bounds, axis);
        break;
      case 'time':
        scales[axis] = time(extents[axis], bounds);
        break;
      }
    });

    return scales;
  }

  return {
    ordinal: ordinal,
    linear: linear,
    exponential: exponential,
    time: time,
    xy: xy
  };
});

define('visutils',['lodash'], function (_) {
  function getInsertionPoint(zIndex) {
    return _.chain(_.range(zIndex, 10)).reverse().map(function (z) {
      return 'g[data-index="' + z + '"]';
    }).value().join(', ');
  }

  function colorClass(el, i) {
    var c = el.getAttribute('class');
    return ((c !== null) ? c.replace(/color\d+/g, '') : '') + ' color' + i;
  }

  return {
    getInsertionPoint: getInsertionPoint,
    colorClass: colorClass
  };
});

define('vis/bar',['visutils', 'scales'], function (utils, scales) {

  var zIndex = 2,
    selector = 'g.bar',
    insertBefore = utils.getInsertionPoint(zIndex);

  function postUpdateScale(self, scaleData, mainData, compData) {
    self.xScale2 = d3.scale.ordinal()
      .domain(d3.range(0, mainData.length))
      .rangeRoundBands([0, self.xScale.rangeBand()], 0.08);
  }

  function enter(self, storage, className, data, callbacks) {
    var barGroups, bars,
      yZero = self.yZero;

    barGroups = self._g.selectAll(selector + className)
      .data(data, function (d) {
        return d.className;
      });

    barGroups.enter().insert('g', insertBefore)
      .attr('data-index', zIndex)
      .style('opacity', 0)
      .attr('class', function (d, i) {
        var cl = _.uniq((className + d.className).split('.')).join(' ');
        return cl + ' bar ' + utils.colorClass(this, i);
      })
      .attr('transform', function (d, i) {
        return 'translate(' + self.xScale2(i) + ',0)';
      });

    bars = barGroups.selectAll('rect')
      .data(function (d) {
        return d.data;
      }, function (d) {
        return d.x;
      });

    bars.enter().append('rect')
      .attr('width', 0)
      .attr('rx', 3)
      .attr('ry', 3)
      .attr('x', function (d) {
        return self.xScale(d.x) + (self.xScale2.rangeBand() / 2);
      })
      .attr('height', function (d) {
        return Math.abs(yZero - self.yScale(d.y));
      })
      .attr('y', function (d) {
        return (d.y < 0) ? yZero : self.yScale(d.y);
      })
      .on('mouseover', callbacks.mouseover)
      .on('mouseout', callbacks.mouseout)
      .on('click', callbacks.click);

    storage.barGroups = barGroups;
    storage.bars = bars;
  }

  function update(self, storage, timing) {
    var yZero = self.yZero;

    storage.barGroups
      .attr('class', function (d, i) {
        return utils.colorClass(this, i);
      })
      .transition().duration(timing)
      .style('opacity', 1)
      .attr('transform', function (d, i) {
        return 'translate(' + self.xScale2(i) + ',0)';
      });

    storage.bars.transition().duration(timing)
      .attr('width', self.xScale2.rangeBand())
      .attr('x', function (d) {
        return self.xScale(d.x);
      })
      .attr('height', function (d) {
        return Math.abs(yZero - self.yScale(d.y));
      })
      .attr('y', function (d) {
        return (d.y < 0) ? yZero : self.yScale(d.y);
      });
  }

  function exit(self, storage, timing) {
    storage.bars.exit()
      .transition().duration(timing)
      .attr('width', 0)
      .remove();
    storage.barGroups.exit()
      .transition().duration(timing)
      .style('opacity', 0)
      .remove();
  }

  function destroy(self, storage, timing) {
    var band = (self.xScale2) ? self.xScale2.rangeBand() / 2 : 0;
    delete self.xScale2;
    storage.bars
      .transition().duration(timing)
      .attr('width', 0)
      .attr('x', function (d) {
        return self.xScale(d.x) + band;
      });
  }

  return {
    postUpdateScale: postUpdateScale,
    enter: enter,
    update: update,
    exit: exit,
    destroy: destroy
  };
});

define('vis/line',['visutils'], function (utils) {

  var zIndex = 3,
    selector = 'g.line',
    insertBefore = utils.getInsertionPoint(zIndex);

  function enter(self, storage, className, data, callbacks) {
    var inter = self._options.interpolation,
      x = function (d, i) {
        if (!self.xScale2 && !self.xScale.rangeBand) {
          return self.xScale(new Date(d.x));
        }
        return self.xScale(d.x) + (self.xScale.rangeBand() / 2);
      },
      y = function (d) { return self.yScale(d.y); },
      line = d3.svg.line()
        .x(x)
        .interpolate(inter),
      area = d3.svg.area()
        .x(x)
        .y1(self.yZero)
        .interpolate(inter),
      container,
      fills,
      paths;

    function datum(d) {
      return [d.data];
    }

    container = self._g.selectAll(selector + className)
      .data(data, function (d) {
        return d.className;
      });

    container.enter().insert('g', insertBefore)
      .attr('data-index', zIndex)
      .attr('class', function (d, i) {
        var cl = _.uniq((className + d.className).split('.')).join(' ');
        return cl + ' line ' + utils.colorClass(this, i);
      });

    fills = container.selectAll('path.fill')
      .data(datum);

    fills.enter().append('path')
      .attr('class', 'fill')
      .style('opacity', 0)
      .attr('d', area.y0(y));

    paths = container.selectAll('path.line')
      .data(datum);

    paths.enter().append('path')
      .attr('class', 'line')
      .style('opacity', 0)
      .attr('d', line.y(y));

    storage.lineContainers = container;
    storage.lineFills = fills;
    storage.linePaths = paths;
    storage.lineX = x;
    storage.lineY = y;
    storage.lineA = area;
    storage.line = line;
  }

  function update(self, storage, timing) {
    storage.lineContainers
      .attr('class', function (d, i) {
        return utils.colorClass(this, i);
      });

    storage.lineFills.transition().duration(timing)
      .style('opacity', 1)
      .attr('d', storage.lineA.y0(storage.lineY));

    storage.linePaths.transition().duration(timing)
      .style('opacity', 1)
      .attr('d', storage.line.y(storage.lineY));
  }

  function exit(self, storage) {
    storage.linePaths.exit()
      .style('opacity', 0)
      .remove();
    storage.lineFills.exit()
      .style('opacity', 0)
      .remove();

    storage.lineContainers.exit()
      .remove();
  }

  function destroy(self, storage, timing) {
    storage.linePaths.transition().duration(timing)
      .style('opacity', 0);
    storage.lineFills.transition().duration(timing)
      .style('opacity', 0);
  }

  return {
    enter: enter,
    update: update,
    exit: exit,
    destroy: destroy
  };
});

define('vis/line-dotted',['lodash', 'vis/line'], function (_, line) {

  function enter(self, storage, className, data, callbacks) {
    var circles;

    line.enter(self, storage, className, data, callbacks);

    circles = storage.lineContainers.selectAll('circle')
      .data(function (d) {
        return d.data;
      }, function (d) {
        return d.x;
      });

    circles.enter().append('circle')
      .style('opacity', 0)
      .attr('cx', storage.lineX)
      .attr('cy', storage.lineY)
      .attr('r', 5)
      .on('mouseover', callbacks.mouseover)
      .on('mouseout', callbacks.mouseout)
      .on('click', callbacks.click);

    storage.lineCircles = circles;
  }

  function update(self, storage, timing) {
    line.update.apply(null, _.toArray(arguments));

    storage.lineCircles.transition().duration(timing)
      .style('opacity', 1)
      .attr('cx', storage.lineX)
      .attr('cy', storage.lineY);
  }

  function exit(self, storage) {
    storage.lineCircles.exit()
      .remove();
    line.exit.apply(null, _.toArray(arguments));
  }

  function destroy(self, storage, timing) {
    line.destroy.apply(null, _.toArray(arguments));
    if (!storage.lineCircles) {
      return;
    }
    storage.lineCircles.transition().duration(timing)
      .style('opacity', 0);
  }

  return {
    enter: enter,
    update: update,
    exit: exit,
    destroy: destroy
  };
});

define('vis/cumulative',[
  'lodash',
  'scales',
  'vis/line-dotted',
], function (_, scales, line) {

  function enter(self, storage, className, data, callbacks) {
    line.enter(self, storage, className, data, callbacks);
  }

  function _accumulate_data(data) {
    function reduce(memo, num) {
      return memo + num.y;
    }

    var nData = _.map(data, function (set) {
      var i = set.data.length,
        d = _.clone(set.data);
      set = _.clone(set);
      while (i) {
        i -= 1;
        // Need to clone here, otherwise we are actually setting the same
        // data onto the original data set.
        d[i] = _.clone(set.data[i]);
        d[i].y0 = set.data[i].y;
        d[i].y = _.reduce(_.first(set.data, i), reduce, set.data[i].y);
      }
      return _.extend(set, { data: d });
    });

    return nData;
  }

  function _resetData(self) {
    if (!self.hasOwnProperty('cumulativeOMainData')) {
      return;
    }
    self._mainData = self.cumulativeOMainData;
    delete self.cumulativeOMainData;
    self._compData = self.cumulativeOCompData;
    delete self.cumulativeOCompData;
  }

  function preUpdateScale(self, data) {
    _resetData(self);
    self.cumulativeOMainData = self._mainData;
    self._mainData = _accumulate_data(self._mainData);
    self.cumulativeOCompData = self._compData;
    self._compData = _accumulate_data(self._compData);
  }

  function destroy(self, storage, timing) {
    _resetData(self);
    line.destroy.apply(null, _.toArray(arguments));
  }

  return {
    preUpdateScale: preUpdateScale,
    enter: enter,
    update: line.update,
    exit: line.exit,
    destroy: destroy
  };
});

// FIXME: ordinal scale filtering requires no animation :(

define('chart',[
  'lodash',
  'scales',
  'vis/bar',
  'vis/line',
  'vis/line-dotted',
  'vis/cumulative',
], function (
  _,
  scales,
  bar,
  line,
  lineDotted,
  cumulative
) {

  var _vis = {
      bar: bar,
      line: line,
      'line-dotted': lineDotted,
      cumulative: cumulative
    },
    emptyData = [[]],
    defaults = {
      // User interaction callbacks
      mouseover: function (data, i) {},
      mouseout: function (data, i) {},
      click: function (data, i) {},

      // Padding between the axes and the contents of the chart
      axisPaddingTop: 0,
      axisPaddingRight: 0,
      axisPaddingBottom: 5,
      axisPaddingLeft: 20,

      // Padding around the edge of the chart (space for axis labels, etc)
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 20,
      paddingLeft: 60,

      // Axis tick formatting
      tickHintX: 10,
      tickFormatX: function (x) { return x; },
      tickHintY: 10,
      tickFormatY: function (y) { return y; },

      // Pre-format input data
      dataFormatX: function (x) { return x; },
      dataFormatY: function (y) { return y; },

      unsupported: function (selector) {
        d3.select(selector).text('SVG is not supported on your browser');
      },

      // Callback functions if no data
      empty: function (self, selector, d) {},
      notempty: function (self, selector) {},

      timing: 750,

      // Line interpolation
      interpolation: 'monotone'
    };

  // What/how should the warning/error be presented?
  function svgEnabled() {
    var d = document;
    return (!!d.createElementNS &&
      !!d.createElementNS('http://www.w3.org/2000/svg', 'svg').createSVGRect);
  }

  /**
   * Creates a new chart
   *
   * @param string type       The drawing type for the main data
   * @param array data        Data to render in the chart
   * @param string selector   CSS Selector for the parent element for the chart
   * @param object options    Optional. See `defaults` for options
   *
   * Examples:
   *    var data = {
   *        "main": [
   *          {
   *            "label": "Foo",
   *            "data": [
   *              {
   *                "x": "2012-08-09T07:00:00.522Z",
   *                "y": 68
   *              },
   *              {
   *                "x": "2012-08-10T07:00:00.522Z",
   *                "y": 295
   *              },
   *              {
   *                "x": "2012-08-11T07:00:00.522Z",
   *                "y": 339
   *              },
   *            ],
   *            "className": ".foo"
   *          }
   *        ],
   *        "xScale": "ordinal",
   *        "yScale": "linear",
   *        "comp": [
   *          {
   *            "label": "Foo Target",
   *            "data": [
   *              {
   *                "x": "2012-08-09T07:00:00.522Z",
   *                "y": 288
   *              },
   *              {
   *                "x": "2012-08-10T07:00:00.522Z",
   *                "y": 407
   *              },
   *              {
   *                "x": "2012-08-11T07:00:00.522Z",
   *                "y": 459
   *              }
   *            ],
   *            "className": ".comp.comp_foo",
   *            "type": "line-arrowed"
   *          }
   *        ]
   *      },
   *      myChart = new Chart('bar', data, '#chart');
   *
   */
  function Chart(type, data, selector, options) {
    var self = this,
      resizeLock;

    self._options = options = _.defaults(options || {}, defaults);

    if (svgEnabled() === false) {
      return options.unsupported(selector);
    }

    self._selector = selector;
    self._container = d3.select(selector);
    self._drawSvg();

    data = _.clone(data);
    if (type && !data.type) {
      data.type = type;
    }

    self.setData(data);

    d3.select(window).on('resize', function () {
      if (resizeLock) {
        clearTimeout(resizeLock);
      }
      resizeLock = setTimeout(function () {
        resizeLock = null;
        self._resize();
      }, 500);
    });
  }

  /**
   * Add a visualization type
   *
   * @param string type   Unique key/name used with setType
   * @param object vis    object map of vis methods
   */
  Chart.setVis = function (type, vis) {
    if (_vis.hasOwnProperty(type)) {
      throw 'Cannot override vis type "' + type + '".';
    }
    _vis[type] = vis;
  };

  /**
   * Get a clone of a visualization
   * Useful for extending vis functionality
   *
   * @param string type   Unique key/name of the vis
   */
  Chart.getVis = function (type) {
    if (!_vis.hasOwnProperty(type)) {
      throw 'Vis type "' + type + '" does not exist.';
    }

    return _.clone(_vis[type]);
  };

  _.defaults(Chart.prototype, {
    /**
     * Set or change the drawing type for the main data.
     *
     * @param string type   Must be an available drawing type
     *
     */
    setType: function (type, skipDraw) {
      var self = this;

      if (self._type && type === self._type) {
        return;
      }

      if (!_vis.hasOwnProperty(type)) {
        throw 'Vis type "' + type + '" is not defined.';
      }

      if (self._type) {
        self._destroy(self._vis, self._mainStorage);
      }

      self._type = type;
      self._vis = _vis[type];
      if (!skipDraw) {
        self._draw();
      }
    },

    /**
     * Set and update the data for the chart. Optionally skip drawing.
     *
     * @param object data       New data. See new Chart example for format
     *
     */
    setData: function (data) {
      var self = this,
        o = self._options,
        nData = _.clone(data);

      if (!data.hasOwnProperty('main')) {
        throw 'No "main" key found in given chart data.';
      }

      switch (data.type) {
      case 'bar':
        // force the xScale to be ordinal
        data.xScale = 'ordinal';
        break;
      case undefined:
        data.type = self._type;
        break;
      }

      if (self._vis) {
        self._destroy(self._vis, self._mainStorage);
      }

      self.setType(data.type, true);

      function _mapData(set) {
        var d = _.map(_.clone(set.data), function (p) {
          var np = _.clone(p);
          if (p.hasOwnProperty('x')) {
            np.x = o.dataFormatX(p.x);
          }
          if (p.hasOwnProperty('y')) {
            np.y = o.dataFormatY(p.y);
          }
          return np;
        })
          .sort(function (a, b) {
            if (!a.x && !b.x) {
              return 0;
            }
            return (a.x < b.x) ? -1 : 1;
          });
        return _.extend(_.clone(set), { data: d });
      }

      nData.main = _.map(nData.main, _mapData);
      self._mainData = nData.main;
      self._xScaleType = nData.xScale;
      self._yScaleType = nData.yScale;

      if (nData.hasOwnProperty('comp')) {
        nData.comp = _.map(nData.comp, _mapData);
        self._compData = nData.comp;
      } else {
        self._compData = [];
      }

      self._draw();
    },

    /**
     * Change the scale of an axis
     *
     * @param string axis   Name of an axis. One of 'x' or 'y'
     * @param string type   Name of the scale type
     *
     */
    setScale: function (axis, type) {
      var self = this;

      switch (axis) {
      case 'x':
        self._xScaleType = type;
        break;
      case 'y':
        self._yScaleType = type;
        break;
      default:
        throw 'Cannot change scale of unknown axis "' + axis + '".';
      }

      self._draw();
    },

    /**
     * Create the SVG element and g container. Resize if necessary.
     */
    _drawSvg: function () {
      var self = this,
        c = self._container,
        options = self._options,
        width = parseInt(c.style('width').replace('px', ''), 10),
        height = parseInt(c.style('height').replace('px', ''), 10),
        svg,
        g,
        gScale;

      svg = c.selectAll('svg')
        .data(emptyData);

      svg.enter().append('svg')
        // Inherit the height and width from the parent element
        .attr('height', height)
        .attr('width', width)
        .attr('class', 'xchart');

      svg.transition()
        .attr('width', width)
        .attr('height', height);

      g = svg.selectAll('g')
        .data(emptyData);

      g.enter().append('g')
        .attr(
          'transform',
          'translate(' + options.paddingLeft + ',' + options.paddingTop + ')'
        );

      gScale = g.selectAll('g.scale')
        .data(emptyData);

      gScale.enter().append('g')
        .attr('class', 'scale');

      self._svg = svg;
      self._g = g;
      self._gScale = gScale;

      self._height = height - options.paddingTop - options.paddingBottom -
        options.axisPaddingTop - options.axisPaddingBottom;
      self._width = width - options.paddingLeft - options.paddingRight -
        options.axisPaddingLeft - options.axisPaddingRight;
    },

    /**
     * Resize the visualization
     */
    _resize: function (event) {
      var self = this;

      self._drawSvg();
      self._draw();
    },

    /**
     * Draw the x and y axes
     */
    _drawAxes: function () {
      if (this._noData) {
        return;
      }
      var self = this,
        o = self._options,
        t = self._gScale.transition().duration(o.timing),
        xTicks = o.tickHintX,
        yTicks = o.tickHintY,
        bottom = self._height + o.axisPaddingTop + o.axisPaddingBottom,
        zeroLine = d3.svg.line().x(function (d) { return d; }),
        zLine,
        zLinePath,
        xAxis,
        xRules,
        yAxis,
        yRules,
        labels;

      xRules = d3.svg.axis()
        .scale(self.xScale)
        .ticks(xTicks)
        .tickSize(-self._height)
        .tickFormat(o.tickFormatX)
        .orient('bottom');

      xAxis = self._gScale.selectAll('g.axisX')
        .data(emptyData);

      xAxis.enter().append('g')
        .attr('class', 'axis axisX')
        .attr('transform', 'translate(0,' + bottom + ')');

      xAxis.call(xRules);

      labels = self._gScale.selectAll('.axisX g')[0];
      if (labels.length > (self._width / 80)) {
        labels.sort(function (a, b) {
          var r = /translate\(([^,)]+)/;
          a = a.getAttribute('transform').match(r);
          b = b.getAttribute('transform').match(r);
          return parseFloat(a[1], 10) - parseFloat(b[1], 10);
        });

        d3.selectAll(labels)
          .filter(function (d, i) {
            return i % (Math.ceil(labels.length / xTicks) + 1);
          })
          .remove();
      }

      yRules = d3.svg.axis()
        .scale(self.yScale)
        .ticks(yTicks)
        .tickSize(-self._width - o.axisPaddingRight - o.axisPaddingLeft)
        .tickFormat(o.tickFormatY)
        .orient('left');

      yAxis = self._gScale.selectAll('g.axisY')
        .data(emptyData);

      yAxis.enter().append('g')
        .attr('class', 'axis axisY')
        .attr('transform', 'translate(0,0)');

      t.selectAll('g.axisY')
        .call(yRules);

      // zero line
      zLine = self._gScale.selectAll('g.axisZero')
        .data([[]]);

      zLine.enter().append('g')
        .attr('class', 'axisZero');

      zLinePath = zLine.selectAll('line')
        .data([[]]);

      zLinePath.enter().append('line')
        .attr('x1', 0)
        .attr('x2', self._width + o.axisPaddingLeft + o.axisPaddingRight)
        .attr('y1', self.yZero)
        .attr('y2', self.yZero);

      zLinePath.transition().duration(o.timing)
        .attr('y1', self.yZero)
        .attr('y2', self.yZero);
    },

    /**
     * Update the x and y scales (used when drawing)
     *
     * Optional methods in drawing types:
     *    preUpdateScale
     *    postUpdateScale
     *
     * Example implementation in vis type:
     *
     *    function postUpdateScale(self, scaleData, mainData, compData) {
     *      self.xScale2 = d3.scale.ordinal()
     *        .domain(d3.range(0, mainData.length))
     *        .rangeRoundBands([0, self.xScale.rangeBand()], 0.08);
     *    }
     *
     */
    _updateScale: function () {
      var self = this,
        _unionData = function () {
          return _.union(self._mainData, self._compData);
        },
        scaleData = _unionData(),
        vis = self._vis,
        scale,
        min;

      delete self.xScale;
      delete self.yScale;
      delete self.yZero;

      if (vis.hasOwnProperty('preUpdateScale')) {
        vis.preUpdateScale(self, scaleData, self._mainData, self._compData);
      }

      // Just in case preUpdateScale modified
      scaleData = _unionData();
      scale = scales.xy(self, scaleData, self._xScaleType, self._yScaleType);

      self.xScale = scale.x;
      self.yScale = scale.y;

      min = self.yScale.domain()[0];
      self.yZero = (min > 0) ? self.yScale(min) : self.yScale(0);

      if (vis.hasOwnProperty('postUpdateScale')) {
        vis.postUpdateScale(self, scaleData, self._mainData, self._compData);
      }
    },

    /**
     * Create (Enter) the elements for the vis
     *
     * Required method
     *
     * Example implementation in vis type:
     *
     *    function enter(self, data, callbacks) {
     *      var foo = self._g.selectAll('g.foobar')
     *        .data(data);
     *      foo.enter().append('g')
     *        .attr('class', 'foobar');
     *      self.foo = foo;
     *    }
     */
    _enter: function (vis, storage, data, className) {
      var self = this,
        callbacks = {
          click: self._options.click,
          mouseover: self._options.mouseover,
          mouseout: self._options.mouseout
        };
      self._checkVisMethod(vis, 'enter');
      vis.enter(self, storage, className, data, callbacks);
    },

    /**
     * Update the elements opened by the select method
     *
     * Required method
     *
     * Example implementation in vis type:
     *
     *    function update(self, timing) {
     *      self.bars.transition().duration(timing)
     *        .attr('width', self.xScale2.rangeBand())
     *        .attr('height', function (d) {
     *          return self.yScale(d.y);
     *        });
     *    }
     */
    _update: function (vis, storage) {
      var self = this;
      self._checkVisMethod(vis, 'update');
      vis.update(self, storage, self._options.timing);
    },

    /**
     * Remove or transition out the elements that no longer have data
     *
     * Required method
     *
     * Example implementation in vis type:
     *
     *    function exit(self) {
     *      self.bars.exit().remove();
     *    }
     */
    _exit: function (vis, storage) {
      var self = this;
      self._checkVisMethod(vis, 'exit');
      vis.exit(self, storage, self._options.timing);
    },

    /**
     * Destroy the current vis type (transition to new type)
     *
     * Required method
     *
     * Example implementation in vis type:
     *
     *    function destroy(self, timing) {
     *      self.bars.transition().duration(timing)
     *        attr('height', 0);
     *      delete self.bars;
     *    }
     */
    _destroy: function (vis, storage) {
      var self = this;
      self._checkVisMethod(vis, 'destroy');
      try {
        vis.destroy(self, storage, self._options.timing);
      } catch (e) {}
    },

    _mainStorage: {},
    _compStorage: {},

    /**
     * Draw the visualization
     */
    _draw: function () {
      var self = this,
        o = self._options,
        comp,
        compKeys;

      self._noData = _.flatten(_.pluck(self._mainData, 'data')
        .concat(_.pluck(self._compData, 'data'))).length === 0;

      self._updateScale();
      self._drawAxes();

      self._enter(self._vis, self._mainStorage, self._mainData, '.main');
      self._exit(self._vis, self._mainStorage);
      self._update(self._vis, self._mainStorage);

      comp = _.chain(self._compData).groupBy(function (d) {
        return d.type;
      });
      compKeys = comp.keys();

      // Find old comp vis items and remove any that no longer exist
      _.each(self._compStorage, function (d, key) {
        if (-1 === compKeys.indexOf(key).value()) {
          var vis = _vis[key];
          self._enter(vis, d, [], '.comp.' + key.replace(/\W+/g, ''));
          self._exit(vis, d);
        }
      });

      comp.each(function (d, key) {
        var vis = _vis[key], storage;
        if (!self._compStorage.hasOwnProperty(key)) {
          self._compStorage[key] = {};
        }
        storage = self._compStorage[key];
        self._enter(vis, storage, d, '.comp.' + key.replace(/\W+/g, ''));
        self._exit(vis, storage);
        self._update(vis, storage);
      });

      if (self._noData) {
        o.empty(self, self._selector, self._mainData);
      } else {
        o.notempty(self, self._selector);
      }
    },

    /**
     * Ensure drawing method exists
     */
    _checkVisMethod: function (vis, method) {
      var self = this;
      if (!vis[method]) {
        throw 'Required method "' + method + '" not found on vis type "' +
          self._type + '".';
      }
    }
  });

  return Chart;

});
if (typeof window.define == 'function' && typeof window.define.amd == 'object' && window.define.amd) {
  return require('chart');
}

window.xChart = require('chart');

}());