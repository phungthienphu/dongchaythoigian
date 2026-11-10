/** Keep camera shortcuts away from text entry, IME and browser commands. */
export function mapRotationShortcut(event:KeyboardEvent):-1|1|null {
  if(event.defaultPrevented||event.repeat||event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return null;
  const target=event.target;
  if(target instanceof HTMLElement&&(target.isContentEditable||target.closest('input,textarea,select,[role="textbox"],[role="dialog"],dialog')))return null;
  const key=event.key.toLowerCase();
  return key==='q'?-1:key==='e'?1:null;
}
