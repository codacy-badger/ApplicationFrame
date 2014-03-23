//default core extensions for the default Application Frame modules - copyright by TitanNano / Jovan Ggerodetti - http://www.titannano.de

$('escape').wrapper(function(){
    
    "use strict";

/* --- eventManagement --- */
    self.EventManager= function(){
        var listeners= [];
        this.addEventListener= function(type, listener, useCapture){
            listeners.push({
                type : type,
                listener : listener,
                useCapture : useCapture
            });
            };
        this.dispatchEvent= function(event){
            listeners.forEach(function(item){
                if(item.type === event.type){
                    item.listener(event);
                    }
                });
            };
        };
	
/* --- advanced Prototyping --- */
    self.prototyping= function(object, types){
        var prototype= {};
        types.forEach(function(Item){
            Item.apply(object);
            var x= new Item();
            for(var i in x){
                prototype[i]= x[i];
                }
            });
//        object.prototype= prototype;
        };
    
/* --- forEach extension --- */
var forEach= function(callback){
    for(var i= 0; i<this.length; i++){
        callback(this[i], i);
        }
    };

// if your required list type isn't here just add it
self.Array.prototype.forEach= forEach;
if(self.NodeList && !self.NodeList.forEach) self.NodeList.prototype.forEach= forEach;
if(self.navigator && self.navigator.isTouch && !self.TouchList.forEach) self.TouchList.prototype.forEach= forEach;
    
/* --- DOM Node extensions --- */
if(self.Node){
    self.Node.prototype.transition= function(add, remove){
        var node= this;
        return new self.Promise(function(setValue){
//          set event listener            
            node.addEventListener('transitionend', function x(e){
                this.removeEventListener('transitionend', x);
                setValue(this, e);
            });
//          set css classes
            if(add && add instanceof Array)
                add.forEach(function(item){
                    node.classList.add(item);
                });
            else if(add)
                node.classList.add(add);
            
            if(remove && remove instanceof Array)
                remove.forEach(function(item){
                    node.classList.add(item);
                });
            else if(remove)
                node.classList.remove(remove);
        });  
    };
}
    
});