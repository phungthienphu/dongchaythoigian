'use client';
import {Children,cloneElement,isValidElement,useState,type ReactNode} from 'react';
import {searchText} from '@/lib/game-ui';
function nodeText(node:ReactNode):string{
  if(typeof node==='string'||typeof node==='number')return String(node);
  if(isValidElement<{children?:ReactNode}>(node))return nodeText(node.props.children);
  return Children.toArray(node).map(child=>isValidElement(child)?nodeText(child):String(child)).join(' ');
}
export default function GuideTopics({children}:{children:ReactNode}){
  const [query,setQuery]=useState('');
  const topics=Children.toArray(children).filter(node=>!query||searchText(nodeText(node)).includes(searchText(query)));
  return <><div className="guide-search"><label>Tìm trong cẩm nang<input type="search" placeholder="Kho đầy, đói, điều quân, ô nhiễm…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div><div className="guide-content">
    {query&&<p className="small muted">{topics.length} mục phù hợp</p>}
    {topics.map(node=>isValidElement<{open?:boolean}>(node)&&node.type==='details'?cloneElement(node,{open:query?true:undefined}):node)}
    {!topics.length&&<p>Chưa tìm thấy chủ đề. Thử từ khóa ngắn hơn hoặc <button onClick={()=>setQuery('')}>xem tất cả</button>.</p>}
  </div></>;
}
