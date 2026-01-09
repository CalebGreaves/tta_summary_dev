// LZString decompression library (minimal version for Base64 decompression)
// Source: https://github.com/pieroxy/lz-string
var LZString=function(){var r=String.fromCharCode,o="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",n="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$",e={};function t(r,o){if(!e[r]){e[r]={};for(var n=0;n<r.length;n++)e[r][r.charAt(n)]=n}return e[r][o]}var i={decompressFromBase64:function(r){return null==r?"":""==r?null:i._0(r.length,32,function(n){return t(o,r.charAt(n))})},_0:function(o,n,e){var t,i,s,a,p,u,l,f=[],c=4,h=4,d=3,m="",v=[],g={val:e(0),position:n,index:1};for(t=0;t<3;t+=1)f[t]=t;for(s=0,p=Math.pow(2,2),u=1;u!=p;)a=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(a>0?1:0)*u,u<<=1;switch(s){case 0:for(s=0,p=Math.pow(2,8),u=1;u!=p;)a=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(a>0?1:0)*u,u<<=1;l=r(s);break;case 1:for(s=0,p=Math.pow(2,16),u=1;u!=p;)a=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(a>0?1:0)*u,u<<=1;l=r(s);break;case 2:return""}for(f[3]=l,i=l,v.push(l);;){if(g.index>o)return"";for(s=0,p=Math.pow(2,d),u=1;u!=p;)a=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(a>0?1:0)*u,u<<=1;switch(l=s){case 0:for(s=0,p=Math.pow(2,8),u=1;u!=p;)a=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(a>0?1:0)*u,u<<=1;f[c++]=r(s),l=c-1,h--;break;case 1:for(s=0,p=Math.pow(2,16),u=1;u!=p;)a=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(a>0?1:0)*u,u<<=1;f[c++]=r(s),l=c-1,h--;break;case 2:return v.join("")}if(0==h&&(h=Math.pow(2,d),d++),f[l])m=f[l];else{if(l!==c)return null;m=i+i.charAt(0)}v.push(m),f[c++]=i+m.charAt(0),i=m,0==--h&&(h=Math.pow(2,d),d++)}}};return i}();

// Get the input configuration
let inputConfig = input.config();
let recordId = inputConfig.recordId;

// Get the Report Requests table
let table = base.getTable('tbljdC7yREJi2o6Xj'); // Your Reports table ID
let record = await table.selectRecordAsync(recordId);

if (!record) {
    throw new Error('Record not found');
}

// Read all JSON fields (up to 10) and concatenate
let json1 = record.getCellValueAsString('JSON 1') || '';
let json2 = record.getCellValueAsString('JSON 2') || '';
let json3 = record.getCellValueAsString('JSON 3') || '';
let json4 = record.getCellValueAsString('JSON 4') || '';
let json5 = record.getCellValueAsString('JSON 5') || '';
let json6 = record.getCellValueAsString('JSON 6') || '';
let json7 = record.getCellValueAsString('JSON 7') || '';
let json8 = record.getCellValueAsString('JSON 8') || '';
let json9 = record.getCellValueAsString('JSON 9') || '';
let json10 = record.getCellValueAsString('JSON 10') || '';

let compressedText = json1 + json2 + json3 + json4 + json5 + json6 + json7 + json8 + json9 + json10;

console.log(`Read JSON chunks: JSON1=${json1.length}, JSON2=${json2.length}, JSON3=${json3.length}, JSON4=${json4.length}, JSON5=${json5.length}, JSON6=${json6.length}, JSON7=${json7.length}, JSON8=${json8.length}, JSON9=${json9.length}, JSON10=${json10.length}`);
console.log(`Total compressed length: ${compressedText.length} characters`);

// Validate that we have data
if (compressedText.length === 0) {
    throw new Error('No JSON data found in any JSON fields');
}

// Decompress the data
let jsonText;
try {
    console.log('Decompressing data...');
    jsonText = LZString.decompressFromBase64(compressedText);
    if (!jsonText) {
        throw new Error('Decompression returned null - data may be corrupted');
    }
    console.log(`Decompressed to ${jsonText.length} characters`);
} catch (e) {
    throw new Error('Failed to decompress data: ' + e.message);
}

// Validate that it's valid JSON
try {
    JSON.parse(jsonText);
} catch (e) {
    throw new Error('Invalid JSON after decompression: ' + e.message);
}

console.log(`Decompressed JSON size: ${jsonText.length} characters`);

// Get the date range for context
let startDate = record.getCellValueAsString('Report Start');
let endDate = record.getCellValueAsString('Report End');

// Pass the decompressed JSON and dates to the next step
// (JSON is already condensed and minified from the frontend)
output.set('hierarchyJson', jsonText);
output.set('startDate', startDate);
output.set('endDate', endDate);
output.set('jsonLength', jsonText.length);

console.log(`✅ Successfully processed JSON (${jsonText.length} characters)`);