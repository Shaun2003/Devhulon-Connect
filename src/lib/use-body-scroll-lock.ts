"use client";

import { useEffect } from "react";

let lockCount = 0;
let scrollPosition = { x: 0, y: 0 };
let previousBodyStyles: Partial<CSSStyleDeclaration> | null = null;
let previousHtmlOverflow = "";

function acquireBodyScrollLock() {
  if (lockCount === 0) {
    const body = document.body;
    const html = document.documentElement;
    scrollPosition = { x: window.scrollX, y: window.scrollY };
    previousBodyStyles = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };
    previousHtmlOverflow = html.style.overflow;

    const scrollbarWidth = window.innerWidth - html.clientWidth;
    body.style.position = "fixed";
    body.style.top = `-${scrollPosition.y}px`;
    body.style.left = `-${scrollPosition.x}px`;
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
    html.style.overflow = "hidden";
  }
  lockCount += 1;

  let released = false;
  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount !== 0 || !previousBodyStyles) return;

    const body = document.body;
    const html = document.documentElement;
    Object.assign(body.style, previousBodyStyles);
    html.style.overflow = previousHtmlOverflow;
    const previousScrollBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = "auto";
    window.scrollTo(scrollPosition.x, scrollPosition.y);
    html.style.scrollBehavior = previousScrollBehavior;
    previousBodyStyles = null;
  };
}

export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    return acquireBodyScrollLock();
  }, [active]);
}
