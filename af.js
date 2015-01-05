//Application Frame v0.1.0 - copyright by TitanNano / Jovan Ggerodetti - http://www.titannano.de

'use strict';

export var $$= (typeof global != 'undefined' ? window : global);
	
//Variables
var asiStorage= new $$.WeakMap();
	
// Classes
// this class defines a new application scope
var ApplicationScope= function(name){
	var self= this;
	this.name= name;
	this.type= 'application';
	this.public= new ApplicationScopeInterface(this);
	this.private=  { 
		public : this.public,
		onprogress : function(f){
			self.listeners.push({ type : 'porgress', listener : f });
		}
    };
	this.thread= null;
	this.workers= [];
	this.listeners= [];
};

ApplicationScope.prototype= {
	getListeners : function(type){
		var list= [];
		
		list.emit= function(value){
			this.forEach(function(item){
				item.listener(value);	
			});
		};
		this.listeners.forEach(function(item){
			if(item.type === type)
				list.push(item);
		});
		return list;
	}
};

// this class defines a new application scope interface
var ApplicationScopeInterface= function(scope){
	asiStorage.set(this, scope);
};
	
ApplicationScopeInterface.prototype= {
	on : function(type, listener){
		var scope= asiStorage.get(this);
		scope.listeners.push({ type : type, listener : listener });
	},
	thread : function(f){
		var scope= asiStorage.get(this);
		scope.workers.push(new ScopeWorker(f));	
	},
	main : function(f){
		var scope= asiStorage.get(this);
		scope.thread= f;
		engine.ready.then(scope.thread.bind(scope.private));
	},
	terminate : function(type){
		var scope= asiStorage.get(this);
		scope.getListeners('terminate').emit(type);
	}
};
  
// this class defines a new mozilla addon scope
var MozillaAddonScope = function(){
    this.name= "addon";
    this.type= 'addon';
    this.thread= null;
	this.public= new MozillaAddonScopeInterface(this);
};
	
// this	class defines a new mozilla addon scope interface
var MozillaAddonScopeInterface= function(scope){
	asiStorage.set(this, scope);
};
	
MozillaAddonScopeInterface.prototype= {
	create : function(thread){
		var scope= asiStorage.get(this);
		scope.thread= thread;
		engine.threadQueue.push(scope);
	},
	'module' : function(f){
		var scope= asiStorage.get(this);
		f.apply(scope.global.exports);
	},
	modules : function(depsObject){
		var scope= asiStorage.get(this);
		Object.keys(depsObject).forEach(key => {
			if(!scope.modules[key])
				scope.modules[key]= depsObject[key];
		});
	},
	hook : function(globalObject){
		var scope= asiStorage.get(this);
		scope.global= globalObject;
	},
	dataURL : function(path){
		var prefixURI= $$.require('@loader/options').prefixURI;
			return (prefixURI + 'af/lib/') + (path || '');
		},
	talkTo : function(worker){
		return {
			talk : function(type, message){
				return new $$.Promise(function(okay){
					var id= createUniqueId();
					worker.port.on(id, function ready(e){
						worker.port.removeListener(ready);
						okay(e);
					});
					worker.port.emit(type, { id : id, message : message });
				});
			},
			listen : function(type, callback){
				worker.port.on(type, function(e){
					var id= e.id;
					callback(e.message, function(message){
						worker.port.emit(id, message); 
					});
				});
			}
		};
	}
};

// this class defines a new service scope
var ServiceScope= function(){
	this.thread= null;
	this.private= {};
	this.isReady= false;
	this.messageQueue= [];
	this.public= new ServiceScopeInterface(this);
};
	
// this class defines a new service scope loader
var ServiceScopeInterface= function(scope){
	asiStorage.set(this, scope);
};
	
ServiceScopeInterface.prototype= {
	talk : function(name, data){
		var scope= asiStorage.get(this);
		
		if(name != 'init' && !scope.isReady){
			return new $$.Promise(function(success){
				scope.messageQueue.push({ name : name, data : data, resolve : success });
			});
		}else{
			return new $$.Promise(function(success){
				var id= createUniqueId();
				var listener= function(e){
					if(e.data.name == id){
						scope.thread.removeEventListener('message', listener);
						success(e.data.data);
					}
				};
				scope.thread.addEventListener('message', listener, false);
				scope.thread.postMessage({ name : name, id : id, data : data });
			});
		}
	},
	listen : function(name, callback){
		var scope= asiStorage.get(this);
    	scope.addEventListener('message', function(e){
        	if(e.data.name == name){
            	var id= e.data.id;
                var setAnswer= function(data){
                	scope.postMessage({ name : id, data : data });
				};
				callback(e.data.data, setAnswer);
			}
		}, false);
	},
	main : function(source){
		var scope= asiStorage.get(this);
		
		scope.thread= new $$.ServiceWorker(engine.shared.serviceLoader+'?'+scope.name);
		if(typeof source == "function"){
			source= '$$.main= ' + source.toString();
            source= new $$.Blob([source], { type : 'text/javascript' });
			source= $$.URL.createObjectURL(source);
		}
		scope.thread.talk('init', source).then(function(){
			scope.isReady= true;
			scope.messageQueue.forEach(function(item){
				scope.thread.talk(item.name, item.data).then(function(data){
					item.resolve(data);
				});
			});
//			source= $$.URL.revokeObjectURL(source);
		});
	}
};

// this class defines a new scope worker
var ScopeWorker= function(f, scope){
	var self= this;
	
	this.scope= scope;
	this.thread= f;
	this.promise= new $$.Promise(function(done){
		self.thread.addEventListener('message', function(e){
			if(e.data.name == 'af-worker-done')
				done(e.data.data);
		}, false);
	});
	this.progressListeners= [];
	
	this.thread.addEventListener('message', function(e){
		if(e.data.name == 'af-worker-progress')
			self.progressListners.forEach(function(item){
				item(e.data.data);
			});
	}, false);
};

// this class defines a new scope worker interface
var ScopeWorkerInterface= function(scope){
	asiStorage.set(this, scope);
};
	
ScopeWorkerInterface.prototype= {
	then : function(f){
		return asiStorage.get(this).promise.then(f);
	},
	onprogress : function(f){
		asiStorage.get(this).progressListeners.push(f);
	}
};

// Functions
// this function creates a new unique id
var createUniqueId= function(){
	var time = Date.now();
	while (time == Date.now()){}
	return Date.now();
};
	
var objectReplace= function(update){
	var self= this;
	$$.Object.keys(update).forEach(function(item){
		if(typeof update[item] == 'object' && !$$.Array.isArray(update[item]) && update[item] !== null)
			objectReplace.apply(self[item], [update[item]]);
		else
			self[item]= update[item];
	});
};

var cloneObject= function(object){
	return JSON.parse(JSON.stringify(object));
};

var userAgentParser= function(userAgentString){
	var items= [];
	var current= '';
	var enabled= true;
	var version= '';
	var engines= ['Gecko', 'AppleWebKit', 'Firefox', 'Safari', 'Chrome', 'OPR', 'Trident'];
	var found= [];
	var record= {};

	for(var i= 0; i < userAgentString.length; i++){
		if(userAgentString[i] == ' ' && enabled){
			items.push(current);
			current= '';
		}else if(userAgentString[i] == '('){
			enabled= false;
		}else if(userAgentString[i] == ')'){
			enabled= true;
		}else{
			current+= userAgentString[i];
		}
	}
	items.push(current);

	items.forEach(function(item){
		if(item.indexOf(';') > -1){
			record.platform= item;
		}else if(item.indexOf('/') > -1){
			item= item.split('/');
			if(item[0] == 'Version'){
				version= item[1];
			}else{
				item.push(engines.indexOf(item[0]));
				found.push(item);
			}
		}
	});

	$$.console.log(found);
	if(found.length == 1){
		record.engine= found[0][0];
		record.engineVersion= found[0][1];
	}else if(found.length > 1){
		found.sort(function(a, b){
			if(a[2] < b[2])
				return 0;
			else
				return 1;
		});
		$$.console.log(found);
		record.engine= found[found.length-1][0];
		record.engineVersion= found[found.length-1][1];
	}else{
		record.engine= 'unknown';
		record.engineVersion= '1';
	}

	record.arch= 'x32';

	record.platform.substring(1, record.platform.length-2).split('; ').forEach(function(item){
		if(item.indexOf('OS X') > -1){
			record.platform= item;
			record.arch= 'x64';
		}else if(item.indexOf('Windows') > -1){
			record.platform= item;
		}else if(item.indexOf('Linux') > -1){
			record.platform= item;
		}else if(item.indexOf('WOW64') > -1 || item.indexOf('Win64') > -1 || item.indexOf('x64') > -1){
			record.arch= 'x64';
		}else if(item.indexOf('/') > -1){
			if(engines.indexOf(item.split('/')[0]) > -1){
				record.engine= item.indexOf('/')[0];
				record.engineVersion= item.indexOf('/')[1];
			}
		}
	});

	if(version !== ''){
		record.engineVersion= version;
	}

	return record;
};

// Engine
//the engine hash, holds private flags, arrays and functions.
var engine = {
	shared : {
		serviceLoader : '',
		renderModes : ['default'],
		feature : {
			chromeLevel : ($$.location.protocol == 'chrome:' || $$.location.protocol == 'resource:'),
			storrage : !engine.features.chromeLevel && (function(){try{ return $$.sessionStorage && $$.localStorage; }catch(e){ return false; }})(),
			indexedDB : !engine.features.chromeLevel && (function(){try{ return $$.indexedDB; }catch(e){ return false; }})(),
        	notifications : ($$.Notification) || false,
        	renderFrame : ($$.requestAnimationFrame) || false,
        	audio : ($$.Audio) || false,
        	indexOf : ($$.Array.indexOf) || false,
        	forEach : ($$.Array.forEach) || false,
        	geolocation : ($$.navigator.geolocation) || false,
        	appCache : ($$.applicationCache) || false,
        	xcom : ($$.postMessage) || false,
        	blobs : ($$.Blob) || false,
        	clipBoard : ($$.ClipboardEvent) || false,
        	file : ($$.File) || false,
        	fileReader : ($$.FileReader) || false,
        	hashchange : (typeof $$.onhashchange != "undefined") || false,
        	json : ($$.JSON) || false,
        	matchMedia : ($$.matchMedia) || false,
        	timing : ($$.PerformanceTiming) || false,
        	pageVisibility : ((typeof $$.document.hidden != "undefined") && $$.document.visibilityState),
        	serverSentEvent : ($$.EventSource) || false,
        	webWorker : ($$.Worker) || false,
			sharedWebWorker : ($$.SharedWorker) || false,
        	arrayBuffer : ($$.ArrayBuffer)|| false,
        	webSocket : ($$.WebSocket) || false,
        	computedStyle : ($$.getComputedStyle) || false,
        	deviceOrientation : ($$.DeviceOrientationEvent) || false,
        	spread : (function(){try{ return eval("var x; x= [1, 2, 3], (function(x, y, z){})(...x), true;"); }catch(e){ return false; }})()
		}
	},
	itemLibrary : {
		addon : (function(){
			var self= {};

			self.talk= function(type, message){
				if($$ != $$.self){
					return new $$.Promise(function(okay){
						var id= createUniqueId();
						var ready= function(e){
							$$.self.port.removeListener(ready);
							okay(e);
						};
						$$.console.log(id);
						$$.self.port.on(id, ready, false);
						$$.self.port.emit(type, { id : id, message : message });
					});
				}else{
					$$.console.error('Not available in this context!!');
				}
			};

			self.listen= function(type, callback){
				if($$ != $$.self){
					$$.self.port.on(type, function(e){
						var id= e.id;
							callback(e.message, function(message){
								$$.self.port.emit(id, message); 
							});
                		});
				}else{
					$$.console.error('Not available in this context!!');
				}
			};

			if($$ != $$.self)
				return self;
			else
				return null;
		})(),
		applications : {
			'new' : function(name){
				engine.pushScope(new ApplicationScope(name));
				return {
					name : name
				};
			}
		},
		services : {
			'new' : function(name){
				engine.pushScope(new ServiceScope(name));
			},
			setLoaderModule : function(url){
				engine.shared.serviceLoader= url;
			}
		},
		wrap : function(source){
			return new Promise(function(done){
				done(source.apply({}));
			});
		},
		system : {
			settings : function(settings){
				objectReplace.apply(engine.options, settings);
			},
			info : function(){
				return cloneObject(engine.info);
			},
			shared : function(){
				return engine.shared;
			},
			import : function(...modules){
				engine.ready= new Promise(function(ready){
					Promise.all(modules.map(m => System.import(m))).then(modules => modules.forEach(m => {
						if('config' in m){
							if(m.config.main){
								if(!(m.config.main in engine.itemLibrary)){
									engine.itemLibrary[m.config.main]= m[m.config.main];
								}else{
									$$.console.warn('an other version of "'+ m.config.main +'" is already loaded!');
								}
							}else{
								$$.console.error('couldn\'t find main in module config!');
							}
						}
					}));
				});
			}
		}
	},
	options : {
		applicationName : '',
		renderMode : 'default',
		override : 'false'
	},
	info : {
		engine : 'unknown',
    	engineVersion : '1',
    	platform : 'unknown',
    	arch : 'x32',
    	type : 'unknown'
	},
	scopeList : {},
	getLibraryItem : function(name){
		if(typeof name == 'string'){
			return engine.itemLibrary[name];
		}else{
			return engine.itemLibrary[name.name];
		}
	},
	pushScope : function(scope){
		if(!this.scopeList[scope.name] && scope.name != "application")
			this.scopeList[scope.name]= scope;
		else
			$$.console.error('a scope with this name does already exist!');
	},
	getScope : function(name){
		if(name == 'application')
			name= engine.settings.applicationName;
		
		if(engine.scopeList[name])
			return engine.scopeList[name];
		else
			$$.console.error('scope does not exist!');
	},
	ready : new Promise.resolve()
};

// get the current Platform
var platform= null;    

// find out which engine is used
if ($$.navigator){
	engine.info.type= 'Web';
	objectReplace.apply(engine.info, userAgentParser(navigator.userAgent));

//  check if touchscreen is supported
    $$.navigator.isTouch= 'ontouchstart' in $$;
    
// check if current platform is the Mozilla Add-on runtime
}else if($$.exports && $$.require && $$.module){
    var system= $$.require('sdk/system');
	objectReplace.apply(engine.info, {
		engine : system.name,
		engineVersion : system.version,
		platform : system.platform + ' ' + system.platformVersion,
		type : 'MozillaAddonSDK',
		arch : system.architecture
	});

// check if current platform is the Node.js runtime
}else if($$.process && $$.process.versions && $$.process.env && $$.process.pid){
    objectReplace.apply(engine.info, {
		engine : $$.process.name,
		engineVersion : $$.process.versions.node,
		platform : $$.process.platform,
		arch : $$.process.arch,
		type : 'Node'
	});
}

//  publish APIs
export var $= engine.getLibraryItem;
export var $_= engine.getScope;
