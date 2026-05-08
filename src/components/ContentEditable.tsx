import React, { useRef, useEffect } from 'react';

interface ContentEditableProps extends React.HTMLAttributes<HTMLDivElement> {
  html: string;
  onChange: (html: string) => void;
  placeholder?: string;
  currentColor?: string;
}

export const ContentEditable: React.FC<ContentEditableProps> = ({ 
  html, 
  onChange, 
  placeholder,
  currentColor,
  className,
  onFocus,
  onBlur,
  onMouseDown,
  onMouseEnter,
  onMouseUp,
  onKeyDown,
  onPaste,
  ...props
}) => {
  const contentEditableRef = useRef<HTMLDivElement>(null);

  const enforceColor = () => {
    if (currentColor !== undefined && currentColor !== '') {
      const selection = window.getSelection();
      if (selection && selection.isCollapsed) {
        document.execCommand('styleWithCSS', false, 'true');
        document.execCommand('foreColor', false, currentColor);
        document.execCommand('styleWithCSS', false, 'false');
      }
    }
  };

  const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (currentColor !== undefined && currentColor !== '' && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      
      // Check for current formatting states
      const isBold = document.queryCommandState('bold');
      const isItalic = document.queryCommandState('italic');
      const isUnderline = document.queryCommandState('underline');
      
      let html = e.key;
      if (isBold) html = `<b>${html}</b>`;
      if (isItalic) html = `<i>${html}</i>`;
      if (isUnderline) html = `<u>${html}</u>`;
      
      if (e.key === ' ') {
        document.execCommand('insertText', false, ' ');
      } else {
        document.execCommand('insertHTML', false, `<span style="color: ${currentColor}">${html}</span>`);
      }
      return;
    }
    if (onKeyDown) onKeyDown(e);
  };

  const handlePasteInternal = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
    if (onPaste) onPaste(e);
  };

  useEffect(() => {
    if (contentEditableRef.current && html !== contentEditableRef.current.innerHTML && document.activeElement !== contentEditableRef.current) {
      contentEditableRef.current.innerHTML = html;
    }
  }, [html]);

  const htmlRef = useRef(html);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    htmlRef.current = html;
    onChangeRef.current = onChange;
  }, [html, onChange]);

  useEffect(() => {
    if (!contentEditableRef.current) return;

    const observer = new MutationObserver(() => {
      if (contentEditableRef.current && htmlRef.current !== contentEditableRef.current.innerHTML) {
        onChangeRef.current(contentEditableRef.current.innerHTML);
      }
    });

    observer.observe(contentEditableRef.current, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div
      {...props}
      ref={contentEditableRef}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      className={`relative ${className} ${(!html || html === '<br>' || html === '<div><br></div>' || html === '&nbsp;' || html === '\u00A0') && placeholder ? 'content-editable-placeholder' : ''}`}
      data-placeholder={placeholder}
      onInput={(e) => {
        onChange(e.currentTarget.innerHTML);
        document.dispatchEvent(new Event('selectionchange'));
      }}
      onFocus={(e) => {
        if (onFocus) onFocus(e);
        enforceColor();
      }}
      onBlur={(e) => {
        onChange(e.currentTarget.innerHTML);
        if (onBlur) onBlur(e);
      }}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseUp={(e) => {
        if (onMouseUp) onMouseUp(e);
        enforceColor();
      }}
      onKeyUp={(e) => {
        enforceColor();
      }}
      onKeyDown={handleKeyDownInternal}
      onPaste={handlePasteInternal}
    />
  );
};
