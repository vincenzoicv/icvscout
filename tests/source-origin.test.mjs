import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceTier,shouldAutoPublishCandidate} from '../functions/api/[[path]].js';

test('official classification requires the publisher hostname, not names or URL fragments',()=>{
  for(const url of ['https://juventus.com.fake.test/news','https://fake.test/juventus.com','https://fake.test/?source=uefa.com','https://juventus.com@fake.test/news','javascript:juventus.com']){
    assert.equal(sourceTier({},null,'Juventus.com ufficiale',url),'rumor');
    assert.equal(shouldAutoPublishCandidate({},null,{reliability:'official',sourceName:'Juventus.com',sourceUrl:url}),false);
  }
  for(const url of ['https://www.juventus.com/it/news/','https://www.legaseriea.it/news','https://uefa.com/news','https://inside.fifa.com/news'])assert.equal(sourceTier({},null,'',url),'official');
});
test('aggregator queries cannot confer official or trusted publisher status',()=>{
  const source={name:'Juventus ufficiale - Google News',reliability:'official',url:'https://news.google.com/rss/search?q=site%3Ajuventus.com'};
  assert.equal(sourceTier({},source,'Juventus.com','https://news.google.com/rss/articles/opaque'),'aggregator');
  assert.equal(sourceTier({},null,'Sky Sport','https://fake.test/?sky=gazzetta'),'rumor');
  assert.equal(sourceTier({},null,'','https://sport.sky.it/calcio'),'trusted');
});
test('Bing publisher redirects are classified by their parsed destination',()=>{
  const redirect=url=>'https://www.bing.com/news/apiclick.aspx?url='+encodeURIComponent(url);
  assert.equal(sourceTier({},null,'',redirect('https://www.juventus.com/it/news/')),'official');
  assert.equal(sourceTier({},null,'',redirect('https://gazzetta.it/calcio')),'trusted');
  assert.equal(sourceTier({},null,'Juventus.com',redirect('https://juventus.com.fake.test/news')),'rumor');
});
test('Romano automatic publication requires a known account, not a copied name',()=>{
  const source={name:'Fabrizio Romano Juventus',reliability:'trusted',url:'https://t.me/s/fabrizioromanotg'};
  const candidate=url=>({reliability:'trusted',sourceName:'Fabrizio Romano',sourceUrl:url});
  for(const url of ['https://t.me/s/fabrizioromanotg/123','https://x.com/FabrizioRomano/status/123'])assert.equal(shouldAutoPublishCandidate({},source,candidate(url)),true);
  for(const url of ['https://fake.test/fabrizio-romano','https://t.me/s/fabrizioromanotg_fake','https://x.com/SomeoneElse/status/123'])assert.equal(shouldAutoPublishCandidate({},source,candidate(url)),false);
});
test('explicit trusted settings remain usable without granting official status',()=>{
  const source={name:'Fonte scelta',reliability:'trusted',url:'https://example.test/feed'};
  const candidate={reliability:'trusted',sourceUrl:'https://example.test/news'};
  assert.equal(sourceTier({},source,'',candidate.sourceUrl),'trusted');
  assert.equal(shouldAutoPublishCandidate({NEWS_TRUSTED_AUTOPUBLISH:'fonte scelta'},source,candidate),true);
  assert.equal(shouldAutoPublishCandidate({NEWS_TRUSTED_AUTOPUBLISH:'scelta'},source,candidate),false);
  assert.equal(sourceTier({NEWS_BLACKLIST:'example.test'},source,'',candidate.sourceUrl),'blacklist');
});
