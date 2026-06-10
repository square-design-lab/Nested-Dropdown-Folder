/*!
 * SDL Nested Dropdown Folder Menu — v1.0
 * Square Design Lab
 *
 * Adds nested dropdown/accordion menus to the Squarespace header nav.
 * No native Squarespace support required — nest items by prefixing their
 * name with "--" (configurable) in the Squarespace Navigation editor.
 *
 * Configure by defining `window.sdlNestedFolderSettings` BEFORE this script.
 * Written as a single IIFE (no classes / no constructor) for easy debugging.
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   * Settings
   * ------------------------------------------------------------------ */

  const DEFAULTS = {
    nestedItemPrefix: "--",
    linkNestedFolderOnDesktop: false,
    mobileIcon:
      '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>',
  };

  // Shallow merge is enough — settings is a flat object.
  const settings = Object.assign({}, DEFAULTS, window.sdlNestedFolderSettings || {});

  // Shared references / state collected during init.
  const header = document.querySelector("#header");
  const desktopFolders = []; // [{ id, item, linkEl, parentFolder, nestedItems, folderElement }]
  const mobileFolders = []; // [{ id, item, linkEl, folderId, nestedItems, accordionContent }]

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */

  function emitEvent(type, detail, elem) {
    if (!type) return;
    (elem || document).dispatchEvent(
      new CustomEvent(type, { bubbles: true, cancelable: true, detail: detail || {} })
    );
  }

  function hasPrefix(el) {
    return el && el.textContent.trim().startsWith(settings.nestedItemPrefix);
  }

  function uniqueId(text, folderIndex, itemIndex, scope) {
    const clean = text
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    return (scope || "desktop") + "-nested-folder-" + folderIndex + "-" + itemIndex + "-" + clean;
  }

  /**
   * Walks a list of nav items and groups "--" prefixed items under the
   * plain item directly above them. Returns the collected parent records and
   * the prefixed elements that should be moved out of their original spot.
   */
  function groupNestedItems(items) {
    const parents = [];
    const toRemove = [];
    let current = null;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const prefixed = hasPrefix(item);
      const nextPrefixed = hasPrefix(items[i + 1]);

      if (!prefixed && nextPrefixed) {
        // Plain item immediately followed by a nested item => a parent trigger.
        current = { item: item, linkEl: item.querySelector("a"), nestedItems: [] };
        parents.push(current);
      } else if (prefixed && current) {
        current.nestedItems.push({ element: item, linkEl: item.querySelector("a") });
        toRemove.push(item);
      } else if (!prefixed && !nextPrefixed) {
        current = null;
      }
    }

    return { parents: parents, toRemove: toRemove };
  }

  /* ------------------------------------------------------------------ *
   * Desktop — hover dropdowns
   * ------------------------------------------------------------------ */

  function processDesktopFolders() {
    const folderContents = document.querySelectorAll(
      ".header-display-desktop .header-nav-item--folder .header-nav-folder-content"
    );

    folderContents.forEach((folderContent, folderIndex) => {
      const items = Array.from(folderContent.querySelectorAll(".header-nav-folder-item"));
      const parentFolder = folderContent.closest(".header-nav-item--folder");

      const { parents, toRemove } = groupNestedItems(items);

      parents.forEach((parent, i) => {
        parent.id = uniqueId(parent.item.textContent.trim(), folderIndex, i, "desktop");
        parent.parentFolder = parentFolder;
        parent.folderElement = null;
        desktopFolders.push(parent);
      });

      toRemove.forEach((item) => item.remove());
    });

    desktopFolders.forEach(buildDesktopFolder);

    // Edge-detection on hover.
    desktopFolders.forEach((folderData) => {
      folderData.item.addEventListener("mouseenter", () => {
        requestAnimationFrame(() => checkFolderPosition(folderData));
      });
      folderData.item.addEventListener("mouseleave", () => {
        folderData.parentFolder.classList.remove("folder-side--flipped");
        if (header) header.style.setProperty("--nested-folder-max-width", "initial");
      });
    });
  }

  function buildDesktopFolder(folderData) {
    const trigger = folderData.item;
    const linkEl = folderData.linkEl;
    const parentFolder = folderData.parentFolder;

    parentFolder.classList.add("sdl-nested-dropdown");
    trigger.classList.add("header-nav-item--nested-folder");

    if (linkEl) {
      linkEl.setAttribute("aria-label", "nested folder dropdown");
      linkEl.setAttribute("aria-controls", folderData.id);
      linkEl.setAttribute("aria-expanded", "false");
    }

    const nestedFolder = document.createElement("div");
    nestedFolder.classList.add("nested-folder", "header-nav-folder-content");
    nestedFolder.setAttribute("id", folderData.id);

    folderData.nestedItems.forEach((nestedItem) => {
      const link = nestedItem.linkEl;
      if (link && !link.querySelector(".header-nav-folder-item-content")) {
        link.innerHTML = '<span class="header-nav-folder-item-content">' + link.innerHTML + "</span>";
      }
      nestedFolder.appendChild(nestedItem.element);
    });

    trigger.appendChild(nestedFolder);
    folderData.folderElement = nestedFolder;

    // Clickthrough: parent links to first child OR becomes a non-clickable label.
    if (settings.linkNestedFolderOnDesktop && folderData.nestedItems.length > 0) {
      const firstHref = folderData.nestedItems[0].linkEl
        ? folderData.nestedItems[0].linkEl.getAttribute("href")
        : null;
      if (firstHref && linkEl) {
        linkEl.setAttribute("href", firstHref);
        folderData.nestedItems[0].element.classList.add("hidden-link");
      }
    } else if (linkEl) {
      linkEl.setAttribute("rel", "nofollow");
      linkEl.addEventListener("click", (e) => e.preventDefault());
    }

    // If a nested folder is the first child of the Squarespace folder, the
    // folder's own title button should not navigate either.
    if (
      parentFolder.querySelector(
        ".header-nav-folder-content > .header-nav-item--nested-folder:first-child"
      )
    ) {
      const parentButton = parentFolder.querySelector("button.header-nav-folder-title");
      if (parentButton) parentButton.setAttribute("rel", "nofollow");
    }
  }

  /**
   * Flip a dropdown to the left if it overflows the right edge of the viewport,
   * then shrink it if it still overflows the left edge after flipping.
   */
  function checkFolderPosition(folderData) {
    if (!folderData.folderElement || !header) return;

    folderData.parentFolder.classList.remove("folder-side--flipped");
    header.style.setProperty("--nested-folder-max-width", "initial");

    const rightEdge = window.innerWidth - window.innerWidth * 0.03;
    const folderRight = folderData.folderElement.getBoundingClientRect().right;

    if (rightEdge < folderRight) {
      folderData.parentFolder.classList.add("folder-side--flipped");

      requestAnimationFrame(() => {
        const leftEdge = window.innerWidth * 0.03;
        const folderLeft = folderData.folderElement.getBoundingClientRect().left;
        if (folderLeft < leftEdge) {
          const shrinkBy = leftEdge - folderLeft;
          header.style.setProperty("--nested-folder-max-width", "calc(100% - " + shrinkBy + "px)");
        }
      });
    }
  }

  /* ------------------------------------------------------------------ *
   * Mobile — accordion menus
   * ------------------------------------------------------------------ */

  function processMobileFolders() {
    const folders = document.querySelectorAll(".header-menu-nav-folder[data-folder]");

    folders.forEach((mobileFolder, folderIndex) => {
      const folderContent = mobileFolder.querySelector(".header-menu-nav-folder-content");
      if (!folderContent) return;

      const folderId = mobileFolder.getAttribute("data-folder");
      const items = Array.from(
        folderContent.querySelectorAll(".header-menu-nav-item:not(.header-menu-controls)")
      );

      const { parents, toRemove } = groupNestedItems(items);

      parents.forEach((parent, i) => {
        parent.id = uniqueId(parent.item.textContent.trim(), folderIndex, i, "mobile");
        parent.folderId = folderId;
        parent.accordionContent = null;
        mobileFolders.push(parent);
      });

      toRemove.forEach((item) => item.remove());
    });

    mobileFolders.forEach(buildMobileFolder);
  }

  function buildMobileFolder(folderData) {
    const trigger = folderData.item;
    const linkEl = folderData.linkEl;

    trigger.classList.add("header-menu-nav-item--accordion-folder");

    if (linkEl && !linkEl.querySelector(".icon")) {
      linkEl.innerHTML += '<span class="icon">' + settings.mobileIcon + "</span>";
    }

    const accordionContent = document.createElement("div");
    accordionContent.classList.add("accordion-folder-content");

    const accordionWrapper = document.createElement("div");
    accordionWrapper.classList.add("accordion-folder-wrapper");

    folderData.nestedItems.forEach((nestedItem) =>
      accordionWrapper.appendChild(nestedItem.element)
    );

    accordionContent.appendChild(accordionWrapper);
    trigger.appendChild(accordionContent);
    folderData.accordionContent = accordionContent;

    if (linkEl) {
      linkEl.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();

        if (accordionContent.style.maxHeight) {
          linkEl.classList.remove("open");
          accordionContent.style.maxHeight = null;
        } else {
          linkEl.classList.add("open");
          accordionContent.style.maxHeight = accordionContent.scrollHeight + "px";
        }
      });
    }
  }

  /* ------------------------------------------------------------------ *
   * Prefix stripping, active states & accessibility
   * ------------------------------------------------------------------ */

  function removeDashPrefix() {
    const links = document.querySelectorAll(
      ".header-nav-item--nested-folder a, .header-menu-nav-item--accordion-folder a"
    );

    links.forEach((link) => {
      const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT, null, false);
      let node;
      while ((node = walker.nextNode())) {
        const text = node.nodeValue.trim();
        if (text.startsWith(settings.nestedItemPrefix)) {
          const stripped = text.substring(settings.nestedItemPrefix.length).trim();
          node.nodeValue = node.nodeValue.replace(text, stripped);
        }
      }
    });
  }

  function setActiveNavItem() {
    const links = document.querySelectorAll(
      "#header .header-menu-nav-folder-content a:not([data-action]), #header .header-nav a:not([data-action])"
    );
    const currentPath = window.location.pathname;

    links.forEach((link) => {
      if (currentPath !== link.getAttribute("href")) return;

      const desktopParent = link.closest(".sdl-nested-dropdown");
      if (desktopParent) desktopParent.classList.add("header-nav-item--active");

      const desktopNested = link.closest(".header-nav-item--nested-folder");
      if (desktopNested) desktopNested.classList.add("header-nested-nav-folder-item--active");

      const desktopLeaf = link.closest(".nested-folder .header-nav-folder-item");
      if (desktopLeaf) desktopLeaf.classList.add("header-nav-folder-item--active");

      const mobileItem = link.closest(".header-menu-nav-item");
      if (mobileItem) mobileItem.classList.add("header-menu-nav-item--active");

      const mobileFolder = link.closest("[data-folder]");
      if (mobileFolder) {
        const trigger = document.querySelector(
          '.header-menu-nav-item a[data-folder-id="' + mobileFolder.dataset.folder + '"]'
        );
        if (trigger) {
          const triggerItem = trigger.closest(".header-menu-nav-item");
          if (triggerItem) triggerItem.classList.add("header-menu-nav-item--active");
        }
      }

      link.setAttribute("aria-current", "page");
    });
  }

  function addAccessibility() {
    let usingKeyboard = false;

    document.addEventListener("keydown", (e) => {
      if (e.key === "Tab") usingKeyboard = true;
    });
    document.addEventListener("mousedown", () => (usingKeyboard = false));

    document.addEventListener(
      "focus",
      (event) => {
        // Collapse everything first.
        desktopFolders.forEach((folderData) => {
          if (folderData.linkEl) folderData.linkEl.setAttribute("aria-expanded", "false");
        });

        if (!usingKeyboard) return;

        const closestFolder = event.target.closest(".header-nav-item--nested-folder");
        if (!closestFolder) return;

        const folderLink = closestFolder.querySelector("a");
        if (folderLink) folderLink.setAttribute("aria-expanded", "true");

        const folderData = desktopFolders.find((data) => data.item === closestFolder);
        if (folderData) requestAnimationFrame(() => checkFolderPosition(folderData));
      },
      true
    );
  }

  /* ------------------------------------------------------------------ *
   * Init
   * ------------------------------------------------------------------ */

  function init() {
    if (!header) return;
    processDesktopFolders();
    processMobileFolders();
    addAccessibility();
    setActiveNavItem();
    removeDashPrefix();
    document.body.classList.add("sdl-nested-folders-loaded");
    emitEvent("sdlNestedFolders:loaded", { desktopFolders: desktopFolders, mobileFolders: mobileFolders });
  }

  // Expose a tiny public API.
  window.sdlNestedFolders = { settings: settings, desktopFolders: desktopFolders, mobileFolders: mobileFolders };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
