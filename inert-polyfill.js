/*
 * Copyright 2015 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */


window.addEventListener('load', function() {
  function applyStyle(css) {
    var style = document.createElement('style');
    style.type = 'text/css';
    if (style.styleSheet) {
      style.styleSheet.cssText = css;
    } else {
      style.appendChild(document.createTextNode(css));
    }
    document.body.appendChild(style);
  }
  var css = "/*[inert]*/[inert]{-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;pointer-events:none}";
  applyStyle(css);

  /**
   * Sends a fake tab event. This is only supported by some browsers.
   *
   * @param {boolean=} opt_shiftKey whether to send this tab with shiftKey
   */
  function dispatchTabEvent(opt_shiftKey) {
    var ev = null;
    try {
      ev = new KeyboardEvent('keydown', {
        keyCode: 9,
        which: 9,
        key: 'Tab',
        code: 'Tab',
        keyIdentifier: 'U+0009',
        shiftKey: !!opt_shiftKey,
        bubbles: true
      });
    } catch (e) {
      try {
        // Internet Explorer
        ev = document.createEvent('KeyboardEvent');
        ev.initKeyboardEvent(
          'keydown',
          true,
          true,
          window,
          'Tab',
          0,
          opt_shiftKey ? 'Shift' : '',
          false,
          'en'
        )
      } catch (e) {}
    }
    if (ev) {
      try {
        Object.defineProperty(ev, 'keyCode', { value: 9 });
      } catch (e) {}
      document.dispatchEvent(ev);
    }
  }

  /**
   * Finds the nearest adjacent Element in the specified direction. If this is
   * negative, this will include the parent element.
   *
   * @param {!Element} e to find adjacent of
   * @param {number} dir to move in (+ve or -ve)
   * @param {!Element=} opt_initial to prevent descent into
   * @return {Element} adjacent element
   */
  function walkElementTree(e, dir, opt_initial) {
    if (dir < 0) {
      if (e.previousElementSibling) {
        e = e.previousElementSibling;
        while (e.lastElementChild) {
          e = e.lastElementChild;
        }
        return e;
      }
      return e.parentElement;
    }
    if (e != opt_initial && e.firstElementChild) {
      return e.firstElementChild;
    }
    while (e) {
      if (e.nextElementSibling) {
        return e.nextElementSibling;
      }
      e = /** @type {!Element} */ (e.parentElement);
    }
    return null;
  }

  /**
   * Determines whether the specified element is inert, and returns the element
   * which caused this state. This is limited to, but may include, the body
   * element.
   *
   * @param {Element} e to check
   * @return {Element} element is made inert by, if any
   */
  function madeInertBy(e) {
    while (e && e !== document.documentElement) {
      if (e.hasAttribute('inert')) {
        return e;
      }
      e = e.parentElement;
    }
    return null;
  }

  /**
   * Tries to focus on the passed candidate element. Compares to the previously
   * focused element.
   *
   * @param {!Element} candidate
   * @param {Element} previous
   * @return {boolean} if focus was successful
   */
  function tryFocus(candidate, previous) {
    // Ignore elements with -ve tabIndex, as they should not be focusable
    // by tab.
    // FIXME: Some browsers (Mac Safari) ignores some elements in tab
    // ordering, similarly to a default -ve value. This is a user pref,
    // and we need a way to detect it.
    if (!(candidate.tabIndex < 0)) {
      candidate.focus();
      if (document.activeElement !== previous) { return true; }
    }
    return false;
  }

  // Hold onto the last tab direction: next (tab) or previous (shift-tab). This
  // can be used to step over inert elements in the correct direction. Mouse
  // or non-tab events should reset this and inert events should focus nothing.
  var lastTabDirection = 0;
  document.addEventListener('keydown', function(ev) {
    if (ev.keyCode === 9) {
      lastTabDirection = ev.shiftKey ? -1 : +1;
    } else {
      lastTabDirection = 0;
    }
  });
  document.addEventListener('mousedown', function(ev) {
    lastTabDirection = 0;
  });

  // The 'focusin' event bubbles, but instead, use 'focus' with useCapture set
  // to true as this is supported in Firefox. Additionally, target the body so
  // this doesn't generate superfluous events on document itself.
  document.body.addEventListener('focus', function(ev) {
    var target = /** @type {Element} */ (ev.target);
    var inertElement = madeInertBy(target);
    if (!inertElement) { return; }

    // If the page has been tabbed recently, then focus the next element
    // in the known direction (if available).
    if (document.hasFocus() && lastTabDirection !== 0) {

      // Send a fake tab event to enumerate through the browser's view of
      // focusable elements. This is supported in some browsers (not Firefox).
      var previous = document.activeElement;
      dispatchTabEvent(lastTabDirection < 0 ? true : false);
      if (previous != document.activeElement) { return; }

      // Otherwise, enumerate through adjacent elements to find the next
      // focusable element. This won't respect any custom tabIndex.
      var candidate = inertElement;
      for (;;) {
        candidate = walkElementTree(candidate, lastTabDirection, inertElement);
        if (!candidate) { break; }
        if (tryFocus(candidate, target)) { return; }
      }

      // FIXME: If a focusable element can't be found here, it's likely to mean
      // that this is the start or end of the page. Blurring is then not quite
      // right, as it prevents access to the browser chrome.
    }

    // Otherwise, immediately blur the targeted element. Technically, this
    // still generates focus and blur events on the element. This is (probably)
    // the price to pay for this polyfill.
    target.blur();
    ev.preventDefault();
    ev.stopPropagation();
  }, true);

  // Use a capturing click listener as both a safety fallback, and to prevent
  // accessKey access to inert elements.
  document.addEventListener('click', function(ev) {
    if (madeInertBy(/** @type {Element} */ (ev.target))) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  }, true);

  var inertOpts = {
    enumerable: true,
    get: function() { return this.hasAttribute('inert'); },
    set: function(inert) {
      if (inert) {
        this.setAttribute('inert', '');
      } else {
        this.removeAttribute('inert');
      }
    }
  };
  Object.defineProperty(Element.prototype, 'inert', inertOpts);
});