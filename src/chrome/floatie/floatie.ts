import { arrow, computePosition, flip, offset, shift } from '@floating-ui/dom';
import "./floatie.scss";

/*
 * This component is responsible for rendering 
 * the floatie and managing its lifecycle.
 * The floatie is rendered in a shadow dom to
 * avoid interference from parent document.
 * TODO: rename to Popover.ts.
 */
export class Floatie {
    channelName = "floatie_broadcast";
    channel = new BroadcastChannel(this.channelName);
    container: HTMLElement;
    copyButton: HTMLElement;
    searchButton: HTMLElement;
    previewButton: HTMLElement;
    tooltipArrow: HTMLElement;
    documentFragment: DocumentFragment;

    constructor() {
        const markup = `
        <div id="sp-floatie-container">
            <div id="sp-floatie-arrow"></div>
            <div id="sp-floatie-search" class="sp-floatie-action" data-action="search">Search</div>
            <div id="sp-floatie-preview" class="sp-floatie-action" data-action="preview">Preview</div>
            <div id="sp-floatie-copy" class="sp-floatie-action" data-action="copy">Copy</div>
        </div>
        `
        // Parse markup.
        const range = document.createRange();
        range.selectNode(document.getElementsByTagName('body').item(0)!);
        this.documentFragment = range.createContextualFragment(markup);

        // Extract actions buttons.
        const container = this.documentFragment.getElementById("sp-floatie-container");
        const searchButton = this.documentFragment.getElementById("sp-floatie-search");
        const previewButton = this.documentFragment.getElementById("sp-floatie-preview");
        const copyButton = this.documentFragment.getElementById("sp-floatie-copy");
        const tooltipArrow = this.documentFragment.getElementById("sp-floatie-arrow");
        if (!container || !searchButton || !previewButton || !copyButton || !tooltipArrow) {
            throw new Error("Impossible error obtaining action buttons from DOM");
        }
        this.container = container;
        this.searchButton = searchButton;
        this.previewButton = previewButton;
        this.copyButton = copyButton;
        this.tooltipArrow = tooltipArrow;

        console.debug("Initialized floatie");
    }

    getChannelName(): string {
        return this.channelName;
    }

    startListening(): void {
        document.body.appendChild(this.documentFragment);

        // Window level events.
        window.onscroll = () => this.hideAll();
        window.onresize = () => this.hideAll();

        // Listen for mouse up events and suggest search if there's a selection.
        document.onmouseup = (e) => this.maybeShow(e);

        this.setupLinkPreviews();
    }

    /*
     * TODO: On search pages, only wire for search results. 
     * On normal pages, display floatie on all links.
     */
    setupLinkPreviews() {
        const anchors = document.querySelectorAll("a");
        anchors.forEach((a: HTMLAnchorElement) => {
            const absoluteUrlMatcher = new RegExp('^(?:[a-z+]+:)?//', 'i');

            let url: URL;
            try {
                if (absoluteUrlMatcher.test(a.href)) {
                    url = new URL(a.href);
                } else {
                    url = new URL(a.href, document.location.href);
                }
                if (url.protocol !== "http:" && url.protocol !== "https:") {
                    // We don't want to preview other schemes like tel:
                    return;
                }
            } catch (e) {
                // href is an invalid URL
                return;
            }

            if (!a.innerText.trim()) {
                // There is no text, we may be highlighting an image.
                return;
            }

            // TODO: check if computed display is 'none', i.e. link is hidden.

            let timeout: any = null;
            a.addEventListener('mouseover', (e) => {
                if (timeout) {
                    clearTimeout(timeout);
                }
                console.log("hover", e);
                this.showActions(a.getBoundingClientRect(), url.href, [this.previewButton]);
            });
            a.addEventListener('mouseout', (e) => {
                timeout = setTimeout(() => this.hideAll(), 2000);
            });
        });
    }

    stopListening(): void {
        // Remove all UI elements.
        document.body.removeChild(this.documentFragment);

        // Close channel to stop any broadcasts.
        this.channel.close();

        // Remove window/document. listeners.
        document.removeEventListener('onmouseup', (e) => { });
        window.removeEventListener('onscroll', (e) => { });
        window.removeEventListener('onresize', (e) => { });
    }

    maybeShow(e: MouseEvent): void {
        // Ensure button is hidden by default.
        this.hideAll();

        // Filter out empty/irrelevant selections.
        if (typeof window.getSelection == 'undefined') {
            return;
        }
        const selection = window.getSelection()!;
        if (selection.isCollapsed) {
            return;
        }

        // Show appropriate buttons.
        const selectedText = selection.toString().trim();
        const range = selection.getRangeAt(0);
        const boundingRect = range.getBoundingClientRect();
        console.debug("Selected: ", selectedText);
        if (this.shouldShowPreview(e, selectedText)) {
            this.showActions(boundingRect, selectedText, [this.previewButton, this.copyButton])
        } else if (this.shouldShowSearch(e, selectedText)) {
            this.showActions(boundingRect, selectedText, [this.searchButton, this.copyButton])
        } else if (this.shouldShowCopy(selectedText)) {
            this.showActions(boundingRect, selectedText, [this.copyButton]);
        }
    }

    shouldShowCopy(selectedText: string): boolean {
        return selectedText.length > 0;
    }

    shouldShowPreview(e: MouseEvent | KeyboardEvent, selectedText: string): boolean {
        const isUrl = (text: string) => {
            try {
                const unused = new URL(text);
                return true;
            } catch (_) {
                return false;
            }
        };

        const isHyperlink = (e: MouseEvent | KeyboardEvent) => {
            var target: any = e.target;
            do {
                if (target.nodeName.toUpperCase() === 'A' && target.href) {
                    return true;
                }
            } while ((target = target.parentElement));
            return false;
        }

        return isUrl(selectedText) || isHyperlink(e);
    }

    shouldShowSearch(e: MouseEvent, selectedText: string): boolean {
        const isQuerySize = (text: string) => {
            return text.length > 0 && text.length < 100;
        }

        const isEmail = (email: string) => {
            return String(email)
                .toLowerCase()
                .match(
                    /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
                );
        }

        const isDate = (dataStr: string) => {
            return !isNaN(Date.parse(dataStr))
        }

        const hasLetters = (text: string) => {
            return /[a-zA-Z]/.test(text);
        }

        return isQuerySize(selectedText)
            && hasLetters(selectedText)
            && !isEmail(selectedText)
            && !isDate(selectedText)
            && !this.shouldShowPreview(e, selectedText);
    }

    showActions(boundingRect: DOMRect, text: string, buttons: HTMLElement[]) {
        this.hideAll();
        this.showContainer(boundingRect);
        buttons.forEach(b => {
            b.style.display = 'inline-block';
            b.onclick = () => {
                this.channel.postMessage({ action: b.getAttribute("data-action"), data: text });
                this.hideAll();
            }
        });
        // buttons[0].eventListeners
    }

    // It should be a no-op to call this multiple times.
    showContainer(boundingRect: DOMRect): void {
        // Make container visible.
        this.container.style.display = 'block';

        // Ensure it's not covered by other page UI.
        const getMaxZIndex = () => {
            return new Promise((resolve: (arg0: number) => void) => {
                const z = Math.max(
                    ...Array.from(document.querySelectorAll('body *'), (el) =>
                        parseFloat(window.getComputedStyle(el).zIndex)
                    ).filter((zIndex) => !Number.isNaN(zIndex)),
                    0
                );
                resolve(z);
            });
        };

        // We cannot pass boundRect directly as the library treats it as an HTMLElement.
        const virtualEl = {
            getBoundingClientRect() {
                return {
                    width: boundingRect.width,
                    height: boundingRect.height,
                    x: boundingRect.x,
                    y: boundingRect.y,
                    top: boundingRect.top,
                    left: boundingRect.left,
                    right: boundingRect.right,
                    bottom: boundingRect.bottom
                };
            },
        };

        // Position over reference element
        computePosition(virtualEl, this.container, {
            placement: "top",
            strategy: 'absolute', // If you use "fixed", x, y would change to clientX/Y.
            middleware: [
                offset(12), // Space between mouse and tooltip.
                flip(),
                shift({ padding: 5 }), // Space from the edge of the browser.
                arrow({ element: this.tooltipArrow }),],
        }).then(({ x, y, placement, middlewareData }) => {
            /*
             * screenX/Y - relative to physical screen.
             * clientX/Y - relative to browser viewport. Use with position:fixed.
             * pageX/Y - relative to page. Use this with position:absolute.
             */
            Object.assign(this.container.style, {
                top: `${y}px`,
                left: `${x}px`,
            });

            // Handle arrow placement.
            const coords = middlewareData.arrow;

            let staticSide = "bottom";
            switch (placement.split('-')[0]) {
                case "top":
                    staticSide = 'bottom';
                    break;
                case "left":
                    staticSide = "right";
                    break;
                case "bottom":
                    staticSide = "top";
                    break;
                case "right":
                    staticSide = "left";
                    break;
            }
            Object.assign(this.tooltipArrow.style, {
                left: coords?.x != null ? `${coords.x}px` : '',
                top: coords?.y != null ? `${coords.y}px` : '',
                right: '',
                bottom: '',
                [staticSide]: '-4px', // If you update this, update height and width of arrow.
            });

            getMaxZIndex().then((maxZ: number) => {
                this.container.style.zIndex = '' + (maxZ + 10);
                this.tooltipArrow.style.zIndex = '' + (maxZ - 1);
            });
        });
    }

    hideAll(): void {
        this.container.style.display = 'none';
        this.copyButton.style.display = 'none';
        this.searchButton.style.display = 'none';
        this.previewButton.style.display = 'none';
    }
}