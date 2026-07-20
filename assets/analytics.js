(function(){
  "use strict";
  var endpoint = "/api/analytics";
  var internalTrafficCookie = "icv_internal_traffic";
  var allowed = new Set(["page_view","navigation","outbound_click","community_post","community_comment","community_reaction","community_repost","community_save","community_follow","community_report","community_match_message","quiz_result","newsletter_subscribe"]);
  var routeEvents = [
    [/^\/api\/community\/posts$/,"community_post"],
    [/^\/api\/community\/(?:posts\/[0-9a-f-]+|news\/\d+)\/comments$/i,"community_comment"],
    [/^\/api\/community\/posts\/[0-9a-f-]+\/reaction$/i,"community_reaction"],
    [/^\/api\/community\/posts\/[0-9a-f-]+\/repost$/i,"community_repost"],
    [/^\/api\/community\/(?:posts\/[0-9a-f-]+|news\/\d+)\/save$/i,"community_save"],
    [/^\/api\/community\/profiles\/[0-9a-f-]+\/follow$/i,"community_follow"],
    [/^\/api\/community\/reports$/,"community_report"],
    [/^\/api\/community\/match-room$/,"community_match_message"],
    [/^\/api\/quiz-result$/,"quiz_result"],
    [/^\/api\/subscribe$/,"newsletter_subscribe"]
  ];
  function sessionId(){
    try{
      var key="icv_analytics_session", value=sessionStorage.getItem(key);
      if(!value){ value=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)); sessionStorage.setItem(key,value); }
      return value;
    }catch(e){ return Date.now().toString(36)+Math.random().toString(36).slice(2); }
  }
  function pageType(path){
    if(/^\/community(?:\/|$)/.test(path)) return "community";
    if(/^\/quiz/.test(path)) return "quiz";
    if(/^\/mercato/.test(path)) return "mercato";
    if(/^\/grafiche/.test(path)) return "grafiche";
    return path==="/"||path==="/index.html"?"home":"site";
  }
  function source(){
    var query=new URLSearchParams(location.search), utm=query.get("utm_source");
    if(utm) return utm.toLowerCase().slice(0,60);
    if(!document.referrer) return "direct";
    try{
      var host=new URL(document.referrer).hostname.replace(/^www\./,"").toLowerCase();
      if(host===location.hostname.replace(/^www\./,"")) return "internal";
      if(/google\./.test(host)) return "google";
      if(/facebook|fb\./.test(host)) return "facebook";
      if(/instagram/.test(host)) return "instagram";
      if(/tiktok/.test(host)) return "tiktok";
      if(host==="x.com"||/twitter/.test(host)) return "x";
      return host.slice(0,60);
    }catch(e){ return "direct"; }
  }
  function payload(name,meta){
    var query=new URLSearchParams(location.search), ref="";
    try{ ref=document.referrer?new URL(document.referrer).hostname.replace(/^www\./,"").slice(0,120):""; }catch(e){}
    return {event_name:name,session_id:sessionId(),path:location.pathname.slice(0,240)||"/",page_type:pageType(location.pathname),source:source(),referrer_host:ref,campaign:(query.get("utm_campaign")||"").slice(0,100),metadata:meta||{}};
  }
  function isInternalTraffic(){
    return document.cookie.split(";").some(function(part){ return part.trim()===internalTrafficCookie+"=1"; });
  }
  function track(name,meta){
    if(!allowed.has(name)||navigator.doNotTrack==="1"||isInternalTraffic()) return;
    var body=JSON.stringify(payload(name,meta));
    if(navigator.sendBeacon){ navigator.sendBeacon(endpoint,new Blob([body],{type:"application/json"})); return; }
    fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:body,keepalive:true}).catch(function(){});
  }
  window.ICVAnalytics={track:track,isInternalTraffic:isInternalTraffic};
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",function(){track("page_view")},{once:true}); else track("page_view");
  document.addEventListener("click",function(event){
    var el=event.target.closest("a[href],[data-analytics-event]"); if(!el) return;
    var explicit=el.getAttribute("data-analytics-event");
    if(explicit){ track(explicit,{target:(el.id||el.getAttribute("data-analytics-target")||"").slice(0,80)}); return; }
    if(el.tagName!=="A") return;
    try{ var url=new URL(el.href,location.href); if(url.origin!==location.origin) track("outbound_click",{host:url.hostname.replace(/^www\./,"").slice(0,100)}); else if(url.pathname!==location.pathname) track("navigation",{destination:url.pathname.slice(0,180)}); }catch(e){}
  },true);
  var originalFetch=window.fetch;
  window.fetch=function(input,options){
    var requestUrl=typeof input==="string"?input:(input&&input.url)||"";
    var method=String((options&&options.method)||(input&&input.method)||"GET").toUpperCase();
    return originalFetch.apply(this,arguments).then(function(response){
      if(response.ok&&["POST","PUT","PATCH","DELETE"].indexOf(method)>=0){
        try{ var path=new URL(requestUrl,location.href).pathname; for(var i=0;i<routeEvents.length;i++) if(routeEvents[i][0].test(path)){ track(routeEvents[i][1]); break; } }catch(e){}
      }
      return response;
    });
  };
})();
