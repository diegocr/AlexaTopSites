/* ***** BEGIN LICENSE BLOCK *****
 * 
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/
 * 
 * Contributor(s):
 *   Diego Casorran <dcasorran@gmail.com> (Original Author)
 * 
 * ***** END LICENSE BLOCK ***** */

let {classes:Cc,interfaces:Ci,utils:Cu,results:Cr} = Components,
	{ btoa, atob } = Cu.import("resource://gre/modules/Services.jsm"),
	VOID = function(){}, addon, scope = this;

function rsc(n) 'resource://' + addon.tag + '/' + n;
function LOG(m) (m = addon.name + ' Message @ '
	+ (new Date()).toISOString() + "\n> " + m,
		dump(m + "\n"), Services.console.logStringMessage(m));

function xhr(url,cb) {
	let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
		.createInstance(Ci.nsIXMLHttpRequest);
	
	let handler = function(ev) {
		evf(function(m) xhr.removeEventListener( m, handler, false ));
		switch(ev.type) {
			case 'load':
				if(xhr.status == 200) {
					cb(xhr.responseText,ev,xhr);
					break;
				}
			default:
				LOG(ev.type+': '+url+' '+xhr.status);
				cb('',ev,xhr);
				break;
		}
	};
	
	let evf = function(f) ['load','error','abort','timeout'].forEach(f);
		evf(function(m) xhr.addEventListener( m, handler, false ));
	
	xhr.mozBackgroundRequest = true;
	xhr.open('GET', 'http://www.alexa.com/' + url, true);
	xhr.channel.loadFlags |=
		Ci.nsIRequest.LOAD_ANONYMOUS
		| Ci.nsIRequest.LOAD_BYPASS_CACHE
		| Ci.nsIRequest.INHIBIT_PERSISTENT_CACHING;
	xhr.send(null);
}

let i$ = {
	get Window() Services.wm.getMostRecentWindow('navigator:browser'),
	
	nohtml: function(m) {
		return m && (''+m).replace(/<\/?\w[^>]*>/g,'').trim() || '';
	},
	
	m1: function(p,s) {
		let m = s.match(p);
		return m && this.nohtml(m[1]) || '';
	},
	
	getSites: function($,f) {
		let s = addon.storage,
			c = s.get('settings');
		
		if(!c || (!f && s.age('sites') < 604800))
			return;
		
		let sites = {}, sLink, cc = (c.countries||[]), p = 1, next = function() {
			let k = cc.shift();
			
			if(k) {
				let p = 0, forw = function(pc) {
					xhr('topsites/countries;'+(p++)+'/'+k,function(data){
						let m = data.replace(/\s+/g,' ').match(/<li class="site-listing">(.*?)<br clear="all"\/>/g);
						if(m && m.length > 1) {
							m.shift();
							let items = sites[k] || {};
							m.forEach(function(sl) {
								if(pc == c.spc)
									return;
								
								let n = i$.m1(/<h2>(.*?)<\/h2>/,sl);
								if(!n || /\d+\sFound/.test(n)) return;
								
								let link = i$.m1(/<span class="small topsites-label">(.*?)<\/span>/,sl);
								
								if(!link || (sLink && sLink.test(link)))
									return;
								
								let rate = parseFloat(i$.m1(/ title="([\d.]+) Stars"/,sl))*2;
								
								if(!isNaN(rate) && (!rate || rate < c.minr))
									return;
								
								items[n] = {
									link: link,
									rate: rate || -1,
									desc: i$.m1(/<div class="description">(.*?)<\/div>/,sl)
										.replace(/\s*\.+\s*More/,'')
								};
								pc++;
							});
							sites[k] = items;
							if(pc >= c.spc || p > 7) {
								next();
							} else {
								forw(pc);
							}
						} else {
							next();
						}
					});
				};
				forw(0);
			} else {
				if(Object.keys(sites).length < 1) {
					sites = s.get('sites');
				}
				if(sites) {
					s.set('sites',sites);
					s.save();
				}
				$(addon.tag+'-toolbar-button').setAttribute('image',rsc('icon16.png'));
			}
		};
		
		if(c.skip) try {
			sLink = new RegExp(c.skip,'i');
		} catch(e) {}
		$(addon.tag+'-toolbar-button').setAttribute('image','chrome://global/skin/icons/loading_16.png');
		
		next();
	},
	
	startup: function() {
		if("@mozilla.org/parserutils;1" in Cc) {
			let u = Cc["@mozilla.org/parserutils;1"].getService(Ci.nsIParserUtils);
			this.nohtml = function(s) u.convertToPlainText(''+s,0,0).trim();
		} else {
			let u = Cc["@mozilla.org/feed-unescapehtml;1"].getService(Ci.nsIScriptableUnescapeHTML)
			this.nohtml = function(s) u.unescape(''+s).trim();
		}
		
		if(addon.storage.age('countries') > 8640000) {
			let s = addon.storage, k = 'countries';
			xhr('topsites/'+k,function(data) {
				let c = s.get(k) || {};
				data.replace(/<a href='\/topsites\/countries\/([A-Z]{2})'>(.*?)<\/a>/g,function(x,y,z) {
					c[y] = z.trim();
				});
				if(Object.keys(c).length) {
					s.set(k,c);
				}
				/* if(!s.has('flags')) */ {
					c = Object.keys(c);
					let fl = {}, next = function() {
						let n = c.shift();
						if(n) {
							xhr('topsites/'+k+'/'+n,function(data) {
								let f = i$.m1(/<img class="dynamic-icon" src="([^"]+)"/,data);
								if(f) fl[n] = f;
								next();
							});
						} else {
							if(Object.keys(fl).length) {
								s.set('flags',fl);
							}
							s.save();
						}
					};
					next();
			/* 	} else {
					s.save(); */
				}
			});
		}
	},
	
	shutdown: function() {
		
	},
	
	onOpenWindow: function(aWindow) {
		let domWindow = aWindow.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindow);
		loadIntoWindowStub(domWindow);
	},
	onCloseWindow: function() {},
	onWindowTitleChange: function() {}
};

(function(global) global.loadSubScript = function(file,scope)
	Services.scriptloader.loadSubScript(file,scope||global))(this);

function loadIntoWindow(window) {
	if(!(/^chrome:\/\/(browser|navigator)\/content\/\1\.xul$/.test(window&&window.location)))
		return;
	
	function c(n) window.document.createElement(n);
	function $(n) window.document.getElementById(n);
	function e(n,a,e,p) {
		if(!(n = c(n)))
			return null;
		
		if(a)for(let x in a)n.setAttribute(x,''+a[x]);
		if(e)for(let i = 0, m = e.length ; i < m ; ++i ) {
			if(e[i]) n.appendChild(e[i]);
		}
		if(p)p.appendChild(n);
		return n;
	}
	
	let onSaveSettings = function(button,popup) {
		button.addEventListener('click',function(ev) {
			let s = {countries:[]},
				G = function(i) $(addon.tag+i).value;
			
			[].forEach.call($(addon.tag+'-cclist').childNodes,function(n){
				[].forEach.call(n.childNodes,function(n){
					if(n.hasAttribute('checked'))
						s.countries.push(n.getAttribute('cc'));
				});
			});
			
			s.spc  = parseInt(G('-spc'));
			s.minr = parseInt(G('-minr'));
			s.skip = G('-skip').trim();
			
			addon.storage.set('settings', s);
			i$.getSites($,!0);
			popup.hidePopup();
		}, false);
	};
	
	let openSite = function(ev,url) {
		url = url || ev.target.getAttribute('image').replace('favicon.ico','');
		if(!(ev.ctrlKey || ev.metaKey)) {
			window.loadURI(url);
			return;
		}
		let backgroundTab = Services.prefs.getBoolPref('browser.tabs.loadBookmarksInBackground');
		getBrowser(window).loadOneTab(url,null,null,null,backgroundTab,true);
	};
	
	let TBBHandler = (function(ev) {
		ev.preventDefault();
		
		if($(addon.tag+'-toolbar-button').getAttribute('image') != rsc('icon16.png')) {
			return;
		}
		
		switch(ev.button) {
			case 1: {
				let sites = addon.storage.get('sites'), s = [];
				
				for(let u in sites) {
					
					for each(let i in sites[u]) {
						
						if(!~s.indexOf(i.link))
							s.push(i.link);
					}
				}
				
				if((s = s[parseInt(Math.random() * s.length)])) {
					openSite(ev,'http://'+s);
				}
			}	break;
			
			case 0: {
				let p = $(addon.tag+'-popup');
				if(!p) break;
				
				if(addon.storage.get('sites')) {
					
					// if(!p.hasChildNodes())
					{
						while(p.firstChild)
							p.removeChild(p.firstChild);
						
						let sites = addon.storage.get('sites'),
							flags = addon.storage.get('flags')||{},
							ctrie = addon.storage.get('countries');
						
						for(let cc in sites) {
							let menu = e('menu',{label:ctrie[cc],class:'menu-iconic',image:flags[cc]}),
								mpop = e('menupopup');
							
							for(let s in sites[cc]) {
								let a = sites[cc][s],
									j = (a.desc).replace(/\s*(.)\1{2,}/g,'$1');
								
								e('menuitem',{
									label: s.replace(new RegExp('^(?:www\\.)?'+a.link+'\\s*\\W+\\s*','i'),''),
									tooltiptext: (~j.indexOf(a.link)?'':a.link+(j?' - ':'')) + j,
									image:'http://' + a.link + '/favicon.ico',
									class: 'menuitem-iconic'
								},0,mpop).addEventListener('command',openSite,false);
							}
							menu.appendChild(mpop);
							p.appendChild(menu);
						}
					}
					
					p._context = true;
					p.openPopup(ev.currentTarget);
					return true;
				}
			}
			
			case 2: {
				let x = $(addon.tag+'-context');
				if(!x) break;
				
				if(!x.hasChildNodes()) {
					let co = [],
						cd = addon.storage.get('countries'),
						st = addon.storage.get('settings'),
						fl = addon.storage.get('flags') || {};
					
					if( cd ) {
						for(let m in cd) {
							let l, x = cd[m].split(' ').shift();
							if(~['Bosnia','Trinidad'].indexOf(x))
								l = x;
							
							let obj = e('checkbox',{label:l||cd[m],cc:m,src:fl[m]||''});
							
							if(st && ~st.countries.indexOf(m)) {
								obj.setAttribute('checked','true');
							}
							co.push(obj);
						}
						
						let row, rows = [];
						for(let i = 0, m = co.length ; i < m ; ++i) {
							if(!(i % 4)) {
								row = e('row');
								rows.push(row);
							}
							row.appendChild(co[i]);
						}
						
						st = st || {spc:24,minr:7,skip:'(google\\w*|facebook|yahoo|youtube|live|linkedin|bing)\\.'};
						
						e('vbox',{style:'padding:4px'},[
							e('hbox',{align:'baseline',flex:1},[
								e('image',{src:rsc('icon.png')}),
								e('label',{value:addon.name.replace(/\s*[A-Z]/g,function(a) ' '+a),style:'font:bold 36px Verdana'}),
								e('label',{value:addon.version,style:'font:italic 16px Georgia',flex:1})
							]),
							e('groupbox',0,[
								e('hbox',{align:'baseline'},[
									e('label',{value:'Sites per Country:',control:addon.tag+'-spc'}),
									e('textbox',{type:'number',min:5,max:100,value:st.spc,size:4,id:addon.tag+'-spc'}),
									e('label',{value:'Rating:',control:addon.tag+'-minr'}),
									e('textbox',{type:'number',min:1,max:10,value:st.minr,size:3,id:addon.tag+'-minr',
										tooltiptext:'Min rate for a site to be shown'}),
									e('label',{value:'Skip:',control:addon.tag+'-skip'}),
									e('textbox',{value:st.skip,flex:1,id:addon.tag+'-skip',
										tooltiptext:'Skip sites matching with this regexp pattern.'}),
								]),
								e('grid',{style:'box-shadow:inset 0 0 2px 0 rgba(0,0,0,0.6);border-radius:5px;background-color:#e5e4e0',
									tooltiptext:'Select which countries are you interested in.'},
								[
									e('columns',0,[
										e('column',{flex:100}),
										e('column',{flex:100}),
										e('column',{flex:100}),
										e('column',{flex:200}),
										e('column',{flex:100})
									]),
									e('rows',{style:'min-width:650px;max-height:320px;overflow:auto',id:addon.tag+'-cclist'},rows)
								])
							]),
							e('hbox',0,[
								e('spacer',{flex:1}),
								e('button',{label:'Save Changes',id:addon.tag+'-save',style:'padding:0px 14px;margin-right:18px'}),
							]),
						],x);
						onSaveSettings($(addon.tag+'-save'),x);
					}
				}
				x._context = true;
				x.openPopup(ev.currentTarget);
			}	return true;
		}
	}).bind(i$);
	
	addon.wms.set(window,{TBBHandler:TBBHandler});
	
	let gNavToolbox = window.gNavToolbox || $('navigator-toolbox');
	if(gNavToolbox && gNavToolbox.palette.id == 'BrowserToolbarPalette') {
		let m = addon.tag+'-toolbar-button';
		gNavToolbox.palette.appendChild(e('toolbarbutton',{
			id:m,label:addon.name,class:'toolbarbutton-1',
			tooltiptext:addon.name,image:rsc('icon16.png')
		})).addEventListener('click', TBBHandler, false);
		
		if(!addon.branch.getPrefType("version")) {
			let nv = $('nav-bar') || $('addon-bar');
			if( nv ) {
				nv.insertItem(m, null, null, false);
				nv.setAttribute("currentset", nv.currentSet);
				window.document.persist(nv.id, "currentset");
			}
		} else {
			[].some.call(window.document.querySelectorAll("toolbar[currentset]"),
				function(tb) {
					let cs = tb.getAttribute("currentset").split(","),
						bp = cs.indexOf(m) + 1;
					
					if(bp) {
						let at = null;
						cs.splice(bp).some(function(id) at = $(id));
						tb.insertItem(m, at, null, false);
						return true;
					}
				});
		}
		
		let (mps = $('mainPopupSet')) {
			try {
				mps.appendChild(e('menupopup',{id:addon.tag+'-popup',position:'after_end'}));
				mps.appendChild(e('panel',{id:addon.tag+'-context',backdrag:'true',
					position:'bottomcenter topleft',type:'arrow'}));
				
				let (p = $(m)) {
					p.setAttribute('popup',addon.tag+'-popup');
					p.setAttribute('context',addon.tag+'-context');
				}
			} catch(e) {
				LOG(e);
			}
		}
	}
	gNavToolbox = null;
	
	i$.getSites($);
}

function getBrowser(w) {
	
	if(typeof w.getBrowser === 'function')
		return w.getBrowser();
	
	if("gBrowser" in w)
		return w.gBrowser;
	
	return w.BrowserApp.deck;
}

function loadIntoWindowStub(domWindow) {
	
	if(domWindow.document.readyState == "complete") {
		loadIntoWindow(domWindow);
	} else {
		domWindow.addEventListener("load", function() {
			domWindow.removeEventListener("load", arguments.callee, false);
			loadIntoWindow(domWindow);
		}, false);
	}
}

function unloadFromWindow(window) {
	let $ = function(n) window.document.getElementById(n);
	let btnId = addon.tag+'-toolbar-button',btn= $(btnId);
	
	if(addon.wms.has(window)) {
		let wmsData = addon.wms.get(window);
		
		if(wmsData.TBBHandler && btn) {
			btn.removeEventListener('click',wmsData.TBBHandler,false);
		}
		addon.wms.delete(window);
	}
	
	if(btn) {
		btn.parentNode.removeChild(btn);
	} else {
		let gNavToolbox = window.gNavToolbox || $('navigator-toolbox');
		if(gNavToolbox && gNavToolbox.palette.id == 'BrowserToolbarPalette') {
			for each(let node in gNavToolbox.palette) {
				if(node && node.id == btnId) {
					gNavToolbox.palette.removeChild(node);
					break;
				}
			}
		}
	}
	
	['popup','context'].forEach(function(n) {
		if((n = $(addon.tag+'-'+n)))
			n.parentNode.removeChild(n);
	});
}

function Storage(key) {
	this.branch = Services.prefs.getBranch(addon.branch.root + 'storage.' + (key || 'main') + '.');
	this.times = this.get('$'+addon.id.substr(1,8)) || {};
	this.bit = 0x80 | parseInt(addon.id.substr(3,2),16);
}
Storage.prototype = {
	has: function(n) !!this.branch.getPrefType(n),
	get: function(k) this.has(k) && JSON.parse(this.branch.getComplexValue(k,Ci.nsISupportsString).data),
	set: function(k,v) (this.times[k] = parseInt(Date.now()/1000), this.put(k,v)),
	age: function(k) parseInt(Date.now()/1000) - (this.times[k] || 0),
	put: function(k,v) {
		let ss = Ci.nsISupportsString,
			t = Cc["@mozilla.org/supports-string;1"].createInstance(ss);
		t.data = JSON.stringify(v);
		this.branch.setComplexValue(k,ss,t);
	},
	save: function() {
		if(Object.keys(this.times).length) {
			this.put('$'+addon.id.substr(1,8),this.times);
		}
	},
	mess: function(data) let (b = this.bit) data.split('')
		.map(function(n) String.fromCharCode(n.charCodeAt(0) ^ b)).join(""),
};

function startup(data) {
	let tmp = {};
	Cu.import("resource://gre/modules/AddonManager.jsm", tmp);
	tmp.AddonManager.getAddonByID(data.id,function(data) {
		let io = Services.io, wm = Services.wm;
		
		addon = {
			id: data.id,
			name: data.name,
			version: data.version,
			tag: data.name.toLowerCase().replace(/[^\w]/g,''),
			wms: new WeakMap()
		};
		addon.branch = Services.prefs.getBranch('extensions.'+addon.tag+'.');
		addon.storage = new Storage();
		
		io.getProtocolHandler("resource")
			.QueryInterface(Ci.nsIResProtocolHandler)
			.setSubstitution(addon.tag,
				io.newURI(__SCRIPT_URI_SPEC__+'/../',null,null));
		
		let windows = wm.getEnumerator("navigator:browser");
		while(windows.hasMoreElements()) {
			let diegocr = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
			loadIntoWindowStub(diegocr);
		}
		wm.addListener(i$);
		
		i$.startup();
		addon.branch.setCharPref('version', addon.version);
	});
}

function shutdown(data, reason) {
	addon.storage.save();
	
	if(reason == APP_SHUTDOWN)
		return;
	
	i$.shutdown();
	
	Services.wm.removeListener(i$);
	
	let windows = Services.wm.getEnumerator("navigator:browser");
	while(windows.hasMoreElements()) {
		let domWindow = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
		unloadFromWindow(domWindow);
	}
	
	Services.io.getProtocolHandler("resource")
		.QueryInterface(Ci.nsIResProtocolHandler)
		.setSubstitution(addon.tag,null);
	
	for(let m in scope)
		delete scope[m];
}

function install(data, reason) {}
function uninstall(data, reason) {}
