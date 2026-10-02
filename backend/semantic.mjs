import {embeddingTexts,rankSemantic} from '../shared/semantic-ranking.ts';
let ready;const cache=new Map();
export async function semanticPairs(people){
 const {pipeline,env}=await import('@huggingface/transformers');env.cacheDir='.data/models';
 ready??=pipeline('feature-extraction','onnx-community/Qwen3-Embedding-0.6B-ONNX',{dtype:'q8'});const extractor=await ready;
 const texts=embeddingTexts(people);if(!texts.length)return [];const missing=[...new Set(texts.filter(t=>!cache.has(t)))];
 for(const text of missing){const output=await extractor([text],{pooling:'last_token',normalize:true,truncation:true,max_length:128});cache.set(text,output.tolist()[0]);}
 const matches=rankSemantic(people,texts.map(t=>cache.get(t)));cache.clear();return matches;
}
