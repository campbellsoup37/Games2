import {
    Card
} from '../basics.js'

import {
    font, colors, smallCardScale, drawText, drawBox, drawOval, createDeckImg, drawCard, drawLine, enableButton, disableButton
} from '../graphics_tools.js'

// abstract interactables
export class CanvasInteractable {
    constructor() {
        this.moused = false;
        this.pressed = false;
        this.draggable = false;
        this.interactables = [];
    }

    isEnabled() {
        return true;
    }

    isShown() {
        return true;
    }

    setMoused(moused) {
        this.moused = moused;
    }

    isMoused() {
        return this.moused;
    }

    setPressed(pressed) {
        this.pressed = pressed;
    }

    isPressed() {
        return this.pressed;
    }

    wheel() { }

    cursor() {
        return 'default';
    }

    updateMoused(x, y) {
        this.setMoused(
            this.isShown()
            && this.isEnabled()
            && x >= this.x()
            && x <= this.x() + this.width()
            && y >= this.y()
            && y <= this.y() + this.height());

        this.interactableMoused = undefined;
        if (this.isMoused()) {
            this.interactableMoused = this;
            for (const inter of this.interactables) {
                if (!inter.isShown()) {
                    continue;
                }

                let ans1 = inter.updateMoused(x, y);
                if (ans1 !== undefined) {
                    this.interactableMoused = ans1;
                }
            }
        }

        if (this.interactableMoused === this) {
            document.body.style.cursor = this.cursor();
        }

        return this.interactableMoused;
    }
}

export class Panel {
    constructor(container, canvas) {
        this.container = container;
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");

        this.cachedContainerWidth = 0;
        this.cachedContainerHeight = 0;

        this.cachedX = 0;
        this.cachedY = 0;
        this.cachedWidth = 0;
        this.cachedHeight = 0;
    }

    fillContainer(callback) {
        if (this.cachedContainerWidth == this.container.clientWidth
            && this.cachedContainerHeight == this.container.clientHeight) {
            return;
        }

        this.cachedContainerWidth = this.container.clientWidth;
        this.cachedContainerHeight = this.container.clientHeight;

        this.canvas.width = this.container.clientWidth;
        this.canvas.height = this.container.clientHeight;

        let box = this.canvas.getBoundingClientRect();
        this.cachedX = box.left;
        this.cachedY = box.top;
        this.cachedWidth = this.canvas.width;
        this.cachedHeight = this.canvas.height;

        if (callback !== undefined) {
            callback();
        }
    }
}

export class WrappedDOMElement extends CanvasInteractable {
    constructor(element, auto) {
        super();
        this.element = element;
        this.auto = auto;
        if (!auto) {
            this.element.style.position = 'absolute';
        } else {
            this.x = () => this.element.getBoundingClientRect().left;
            this.y = () => this.element.getBoundingClientRect().top;
            this.width = () => this.element.clientWidth;
            this.height = () => this.element.clientHeight;
        }
    }

    dispose() {
        if (this.element.parentElement) {
            this.element.parentElement.removeChild(this.element);
        }
    }

    paint() {
        if (this.container) {
            let container = this.container();
            if (this.element.parentElement !== container) {
                this.dispose();
                if (container) {
                    container.appendChild(this.element);
                }
            }
		}

        if (!this.element.parentElement) {
            return;
        }

        if (this.isShown() != (this.element.style.display != 'none')) {
            this.element.style.display = this.isShown() ? 'inline' : 'none';
        }

        if (this.isShown()) {
            if (!this.auto) {
                this.element.style.left = this.x() + 'px';
                this.element.style.top = this.y() + 'px';
                this.element.style.width = this.width() + 'px';
                this.element.style.height = this.height() + 'px';
            }

            if (this.element.nodeName.toLowerCase() == 'button') {
                let enabled = this.isEnabled();
                if (enabled && this.element.disabled) {
                    enableButton(this.element);
                } else if (!enabled && !this.element.disabled) {
                    disableButton(this.element);
                }
            }

            if (this.update) {
                this.update()
			}
        }
    }
}

export class PanelInteractable extends WrappedDOMElement {
    constructor(container, canvas, auto) {
        super(container, auto);

        this.container = () => container.parentElement;
        this.panel = new Panel(container, canvas);
        this.ctx = this.panel.ctx;
    }

    fillContainer(force) {
        this.panel.fillContainer(force);
    }

    clear() {
        this.ctx.clearRect(0, 0, this.panel.canvas.width, this.panel.canvas.height);
    }

    paint() {
        super.paint();
        this.clear();
        this.fillContainer();
    }
}

export class CanvasButton extends CanvasInteractable {
    constructor(text) {
        super();
        this.text = text;
    }

    paint() {
        if (this.isShown()) {
            if (!this.isEnabled()) {
                ctx.fillStyle = "#606060";
            } else {
                if (this.isMoused()) {
                    ctx.fillStyle = "#C0C0C0";
                } else {
                    ctx.fillStyle = "white";
                }
            }
            drawBox(ctx, this.x(), this.y(), this.width(), this.height(), 10, undefined);
            drawText(ctx, this.text, this.x() + this.width() / 2, this.y() + this.height() / 2, 1, 1, font.bold, 'black');
        }
    }
}

// currently unused
class TextField extends CanvasInteractable {
    constructor(defaultText) {
        super();
        this.defaultText = defaultText;
        this.text = '';
        this.cursor = 0;
        this.left = 0;
        this.right = 0;
    }

    setText(text) {
        this.text = text;
        this.cursor = text.length;
        this.left = 0;
        this.right = text.length;
        this.shrinkLeft();
    }

    getText() {
        return this.text;
    }

    key(e) {
        if (e.keyCode >= 32 && e.keyCode <= 126 && e.key.length == 1) {
            this.text = this.text.substring(0, this.cursor) + e.key + this.text.substring(this.cursor);
            this.cursor++;
            this.right++;

            if (this.cursor == this.right) {
                this.shrinkLeft();
            } else {
                this.shrinkRight();
            }
        } else if (e.keyCode == 8 && this.cursor > 0) {
            this.text = this.text.substring(0, this.cursor - 1) + this.text.substring(this.cursor);
            this.cursor--;

            if (this.right > this.text.length) {
                this.right--;
                this.expandLeft();
            } else {
                this.expandRight();
            }
        } else if (e.keyCode == 46 && this.cursor < this.text.length) {
            this.text = this.text.substring(0, this.cursor) + this.text.substring(this.cursor + 1);

            if (this.right > this.text.length) {
                this.right--;
                this.expandLeft();
            } else {
                this.expandRight();
            }
        } else if (e.keyCode == 37 && this.cursor > 0) {
            this.cursor--;

            if (this.left > this.cursor) {
                this.left--;
                this.shrinkRight();
            }
        } else if (e.keyCode == 39 && this.cursor < this.text.length) {
            this.cursor++;

            if (this.right < this.cursor) {
                this.right++;
                this.shrinkLeft();
            }
        }
    }

    getDisplayedText() {
        return this.text.substring(this.left, this.cursor) + '|' + this.text.substring(this.cursor, this.right);
    }

    shrinkLeft() {
        while (getStringDimensions(this.getDisplayedText())[0] > this.width() - 2 && this.left < this.cursor) {
            this.left++;
        }
    }

    expandLeft() {
        while (getStringDimensions(this.getDisplayedText())[0] < this.width() - 2 && this.left > 0) {
            this.left--;
        }
    }

    shrinkRight() {
        while (getStringDimensions(this.getDisplayedText())[0] > this.width() - 2 && this.right > this.cursor) {
            this.right--;
        }
    }

    expandRight() {
        while (getStringDimensions(this.getDisplayedText())[0] < this.width() - 2 && this.right < this.text.length) {
            this.right++;
        }
    }

    paint() {
        if (this.isShown()) {
            ctx.fillStyle = 'white';
            drawBox(ctx, this.x(), this.y(), this.width(), this.height(), 10, undefined);
            drawText(ctx, this.getDisplayedText(), this.x() + 5, this.y() + this.height() / 2, 0, 1, font.basic, 'black');
        }
    }
}

export class PlayerNamePlate extends CanvasInteractable {
    constructor(player, client) {
        super()
        this.client = client
        this.player = player
        this.pokeTime = undefined
        this.pokeable = false
    }

    x() {
        return (this.player.getX() - this.player.getJust() * this.width() / 2);
    }

    y() {
        return this.player.getY() - 10;
    }

    width() {
        return this.client.vars.maxWid
    }

    height() {
        return 20;
    }

    isShown() {
        return true
    }

    paint() {
        if (!this.client.state.paintNamePlates()) {
            return;
        }

        let ctx = this.client.ctx
        let serverData = this.client.state.baseState.serverData

        // glow
        let enablePoking = this.client.state.enablePoking(this.player)
        if (this.pokeTime === undefined && enablePoking) {
            this.pokeTime = new Date().getTime() + this.client.state.baseState.pokeTime
        } else if (this.pokeTime !== undefined && !enablePoking) {
            this.pokeTime = undefined
		}

        if (enablePoking && new Date().getTime() >= this.pokeTime) {
            ctx.fillStyle = 'rgba(255, 255, 0, 0.1)'
            for (let i = 0; i < 10; i++) {
                drawBox(ctx, this.x() - 2 * i, this.y() - i, this.width() + 4 * i, this.height() + 2 * i, 25, 'rgba(255, 255, 255, 0)');
            }
            this.pokeable = true;
        } else {
            this.pokeable = false;
        }

        // plate
        if (this.client.state.highlightPlayer(this.player)) {
            ctx.fillStyle = "yellow";
        } else if (!this.player.human) {
            ctx.fillStyle = 'rgb(210, 255, 255)';
        } else {
            ctx.fillStyle = "white";
        }
        drawBox(ctx, this.x(), this.y(), this.width(), this.height(), 12, serverData.options.teams ? colors[this.player.team] : undefined);

        // name
        drawText(ctx,
            this.player.name,
            this.x() + this.width() / 2,
            this.y() + this.height() / 2,
            1, 1, font.basic,
            this.player.disconnected ? 'red' : 'black',
            this.width() - 40
        );

        if (!this.client.state.paintBidAndDealerChips()) {
            return
        }

        // bid chip
        if (this.player.bidded) {
            let iRelToMe = this.player.index - this.client.state.baseState.myPlayer.index
            let startX = (this.client.cachedWidth - this.client.state.baseState.scoreWidth) / 2 - 100 * Math.sin(2 * Math.PI * iRelToMe / serverData.players.length);
            let startY = this.client.cachedHeight / 2 - 50 + 100 * Math.cos(2 * Math.PI * iRelToMe / serverData.players.length);
            let endX = this.x() + 10;
            let endY = this.y() + this.height() / 2;
            let t = this.client.state.baseState.bidTimer
            let bidX = startX * (1 - t) + endX * t;
            let bidY = startY * (1 - t) + endY * t;
            let radius = 50 * (1 - t) + 16 * t;

            ctx.fillStyle = this.client.state.bidChipColor(this.player)
            drawOval(ctx, bidX - radius / 2, bidY - radius / 2, radius, radius);
            if (t == 0) {
                ctx.strokeStyle = serverData.options.teams ? colors[this.player.team] : 'black';
                ctx.lineWidth = serverData.options.teams ? 2 : 1;
                drawOval(ctx, bidX - radius / 2, bidY - radius / 2, radius, radius, false);
                ctx.lineWidth = 1;
                drawText(ctx, this.player.bid, bidX, bidY + 1, 1, 1, font.large, 'black');
            } else {
                drawText(ctx, this.player.bid, bidX, bidY, 1, 1, font.basic, 'black');
            }
        }

        if (serverData.roundNumber >= serverData.rounds.length) {
            return
		}

        // dealer chip
        let dealer = serverData.rounds[serverData.roundNumber].dealer
        if (dealer == this.player.index) {
            ctx.fillStyle = 'cyan';
            drawOval(ctx, this.x() + this.width() - 19, this.y() + this.height() / 2 - 8, 16, 16);
            drawText(ctx, 'D', this.x() + this.width() - 11, this.y() + this.height() / 2, 1, 1, font.basic, 'black')
        }
    }

    click() {
        if (this.pokeable) {
            this.client.state.baseState.sendPoke(this.player.index)
            this.pokeTime = undefined
        }
    }
}

export class CanvasCard extends CanvasInteractable {
    constructor(card, scale, deckImg, ctx) {
        super();
        this.card = card;
        this.scale = scale;
        this.deckImg = deckImg
        this.ctx = ctx
    }

    getCard() {
        return this.card;
    }

    x() {
        return this.xCenter() - this.width() / 2;
    }

    y() {
        return this.yCenter() - this.height() / 2;
    }

    xPaintOffset() {
        return 0;
    }

    yPaintOffset() {
        return 0;
    }

    width() {
        return this.scale * this.deckImg.width;
    }

    height() {
        return this.scale * this.deckImg.height;
    }

    isShown() {
        return true;
    }

    hidden() {
        return false;
    }

    dark() {
        return this.isMoused();
    }

    paint() {
        if (this.isShown()) {
            drawCard(this.ctx,
                this.hidden() ? new Card() : this.card,
                this.xCenter() + this.xPaintOffset(),
                this.yCenter() + this.yPaintOffset(),
                this.scale, this.deckImg, this.dark(),
                -1, undefined
            );
        }
    }
}