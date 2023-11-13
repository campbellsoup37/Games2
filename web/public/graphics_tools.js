export var font = {
    basic: "13px Arial",
    bold: "bold 13px Arial",
    small: "bold 9px Arial",
    medium: "bold 24px Arial",
    large: "bold 40px Arial",
    title: "bold 52px Arial"
}
export var colors = [
    'blue', 'red', 'green', 'magenta', 'orange', 
    'pink', 'yellow', 'gray', 'cyan', 'black'
]
export var smallCardScale = 2 / 3

// this function is very expensive -- memo as often as possible
export function getStringDimensions(text, fnt) {
    let span = document.createElement('span');
    document.body.appendChild(span);

    span.style.font = fnt;
    span.style.width = 'auto';
    span.style.height = 'auto';
    span.style.position = 'absolute';
    span.style.whiteSpace = 'no-wrap';
    span.innerHTML = text;

    let width = span.clientWidth;
    let height = span.clientHeight;

    document.body.removeChild(span);

    return [width, height];
}

var darkModeColorMap = {
    '#000000': '#BFBFBF',
    '#ffffff': '#1C1C21',
    '#d2ffff': '#3B4747',
    '#ffff00': '#666600',
    '#000078': '#0080FF',
    '#0000ff': '#0080FF',
    '#00ffff': '#0060DD',
    'rgba(255, 255, 255, 0.7)': 'rgba(28, 28, 33, 0.7)',
    'rgba(175, 175, 175, 0.7)': 'rgba(100, 100, 100, 0.7)',
    '#7dff7d': '#458545',
    '#ffafaf': '#BF5151',
    'rgba(200, 200, 200, 0.7)': 'rgba(110, 110, 110, 0.7)',
    '#e6e6e6': '#404040',
    '#c8c8c8': '#505050',
    '#afaf00': '#666600',
    '#e1afe1': '#603060',
    '#ff0000': '#a40000'
}

export function isNightEyeActive() {
    let nighteye = document.documentElement.getAttribute('nighteye')
    return nighteye == 'active'
}
export function isDarkMode() {
    return isNightEyeActive() || document.getElementById('prefDarkMode').checked
}

export function updateManualDarkMode() {
    document.styleSheets.item(1).disabled = isNightEyeActive() || !isDarkMode()
}

export function adjustedStyle(style) {
    if (!isDarkMode()) {
        return style
    }

    if (style in darkModeColorMap) {
        return darkModeColorMap[style]
    }
    return style
}

export function drawText(ctx, text, x, y, posx, posy, fnt, style, maxWidth) {
    if (arguments.length < 7) {
        fnt = font.basic;
    }
    if (arguments.length < 8) {
        style = 'black';
    }

    ctx.font = fnt;
    ctx.fillStyle = style;
    ctx.fillStyle = adjustedStyle(ctx.fillStyle)
    switch (posx) {
        case 0:
            ctx.textAlign = 'left';
            break;
        case 1:
            ctx.textAlign = 'center';
            break;
        case 2:
            ctx.textAlign = 'right';
            break;
    }
    switch (posy) {
        case 0:
            ctx.textBaseline = 'bottom';
            break;
        case 1:
            ctx.textBaseline = 'middle';
            break;
        case 2:
            ctx.textBaseline = 'top';
            break;
    }

    ctx.fillText(text, x, y + 1, maxWidth);
}

export function drawBox(ctx, x, y, width, height, roundness, borderColor, noBorder, noFill, flatBottom, thickBorder) {
    if (!noFill) {
        let color = ctx.fillStyle
        ctx.fillStyle = adjustedStyle(color)
        ctx.beginPath();
        ctx.moveTo(x + roundness, y);
        ctx.lineTo(x + width - roundness, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + roundness);
        ctx.lineTo(x + width, y + height - roundness);
        if (!flatBottom) {
            ctx.quadraticCurveTo(x + width, y + height, x + width - roundness, y + height);
            ctx.lineTo(x + roundness, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - roundness);
        } else {
            ctx.lineTo(x + width, y + height)
            ctx.lineTo(x, y + height)
            ctx.lineTo(x, y + height - roundness)
        }
        ctx.lineTo(x, y + roundness);
        ctx.quadraticCurveTo(x, y, x + roundness, y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = color
    }

    if (!noBorder) {
        let color = ctx.strokeStyle;
        let unadjustedColor = borderColor === undefined ? '#000000' : borderColor
        ctx.strokeStyle = unadjustedColor
        ctx.strokeStyle = adjustedStyle(ctx.strokeStyle)
        ctx.lineWidth = thickBorder ? 2 : 1;

        ctx.beginPath();
        ctx.moveTo(x + roundness, y);
        ctx.lineTo(x + width - roundness, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + roundness);
        ctx.lineTo(x + width, y + height - roundness);
        if (!flatBottom) {
            ctx.quadraticCurveTo(x + width, y + height, x + width - roundness, y + height);
            ctx.lineTo(x + roundness, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - roundness);
        } else {
            ctx.lineTo(x + width, y + height)
            ctx.lineTo(x, y + height)
            ctx.lineTo(x, y + height - roundness)
        }
        ctx.lineTo(x, y + roundness);
        ctx.quadraticCurveTo(x, y, x + roundness, y);
        ctx.closePath();
        ctx.stroke();

        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
    }
}

export function drawOval(ctx, x, y, width, height, fill) {
    if (arguments.length < 6) {
        fill = true;
    }

    ctx.beginPath();
    ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, 2 * Math.PI);
    if (fill) {
        let color = ctx.fillStyle
        ctx.fillStyle = adjustedStyle(color)
        ctx.fill();
        ctx.fillStyle = color
    } else {
        let color = ctx.strokeStyle
        ctx.strokeStyle = adjustedStyle(color)
        ctx.stroke();
        ctx.strokeStyle = color
    }
}

var deckImgs = {}

class DeckImg {
    constructor(name, id, x0, y0, width, height, xGap, yGap, rows, cols) {
        this.img = document.getElementById(id)
        this.x0 = x0
        this.y0 = y0
        this.width = width
        this.height = height
        this.xGap = xGap
        this.yGap = yGap
        this.rows = rows
        this.cols = cols
        deckImgs[name] = this
    }

    getCoords(card) {
        let code = this.getCode(card)
        let col = code % this.cols
        let row = (code - col) / this.cols
        return {
            x: this.x0 + (this.width + this.xGap) * col,
            y: this.y0 + (this.height + this.yGap) * row
        }
    }
}

class DeckImg1 extends DeckImg {
    constructor(name, id, scale) {
        super(name, id, 0, 0, 112 * scale, 148 * scale, 0, 0, 6, 9)
    }

    getCode(card) {
        if (card.num == 0) {
            return 52
        }
        let rowCodeInv = [3, 1, 2, 0]
        return (card.num - 1) % 13 + 13 * rowCodeInv[card.suit]
    }
}
new DeckImg1('deckimg_1', 'deckimg_old_1', 1)
new DeckImg1('deckimgback_1', 'deckimg_old_1', 1)
new DeckImg1('deckimgsmall_1', 'deckimgsmall_old_1', 0.7441)
new DeckImg1('deckimgsmallback_1', 'deckimgsmall_old_1', 0.7441)

class DeckImg2 extends DeckImg {
    constructor(name, id, scale) {
        super(name, id,
            1416.61 - 666.331 * scale,
            1029.68 + 1.26671 * scale,
            112 * scale,
            148 * scale,
            23.5207 * scale,
            11.1164 * scale,
            5,
            13)
    }

    getCode(card) {
        if (card.num == 0) {
            return 52
        }
        let rowCodeInv = [0, 3, 2, 1]
        return (card.num - 1) % 13 + 13 * rowCodeInv[card.suit]
    }
}
class DeckImgBack2 extends DeckImg {
    constructor(name, id, scale) {
        super(name, id,
            0,
            446 * scale,
            112 * scale,
            148 * scale,
            17 * scale,
            16 * scale,
            2,
            10)
    }

    getCode(card) {
        return document.getElementById('prefCardBack').value - 1
    }
}
new DeckImg2('deckimg', 'deckimg', 1)
new DeckImg2('deckimgdark', 'deckimgdark', 1)
new DeckImgBack2('deckimgback', 'deckimgback', 1)
new DeckImgBack2('deckimgbackdark', 'deckimgbackdark', 1)
new DeckImg2('deckimgsmall', 'deckimgsmall', 0.7441)
new DeckImg2('deckimgsmalldark', 'deckimgsmalldark', 0.7441)
new DeckImgBack2('deckimgsmallback', 'deckimgsmallback', 0.7441)
new DeckImgBack2('deckimgsmallbackdark', 'deckimgsmallbackdark', 0.7441)

export function createDeckImg(name) {
    return deckImgs[name]
}

export function drawCard(ctx, card, x, y, scale, deckImg, dark, maxY, thickBorderColor, angle) {
    let cw1 = deckImg.width;
    let ch1 = deckImg.height;

    if (maxY < 0) {
        maxY = y + ch1 * scale / 2;
    }
    maxY = Math.min(maxY, y + ch1 * scale / 2);
    let diff = maxY - (y - ch1 * scale / 2);

    let x0 = x - cw1 * scale / 2;
    let y0 = y - ch1 * scale / 2;
    let x1 = x + cw1 * scale / 2;
    let y1 = maxY;

    if (angle !== undefined) {
        ctx.translate(x, y)
        ctx.rotate(angle)
        x0 = -cw1 * scale / 2;
        y0 = -ch1 * scale / 2;
    }

    if (card.num == 0) {
        deckImg = deckImg.back
    }
    if (isDarkMode()) {
        deckImg = deckImg.dark
    }
    let coords = deckImg.getCoords(card)

    ctx.drawImage(
        deckImg.img,
        coords.x, coords.y, cw1, diff / scale,
        x0, y0, cw1 * scale, diff
    );

    let roundness = cw1 * scale < 100 ? 4 : 7

    if (dark) {
        ctx.fillStyle = 'rgba(127, 127, 127, 0.3)'
        drawBox(ctx, x0, y0, cw1 * scale, diff, roundness, undefined, true);
    }

    let borderColor = thickBorderColor ? thickBorderColor : '#000000'
    //if (!thickBorderColor && isDarkMode() & card.num != 0) {
    //    borderColor = '#010101' // keep the border black here
    //}
    drawBox(ctx, x0, y0, cw1 * scale, diff, roundness, borderColor, false, true, diff < ch1 * scale - 1, thickBorderColor !== undefined)

    if (angle !== undefined) {
        ctx.rotate(-angle)
        ctx.translate(-x, -y)
    }
}

export function drawLine(ctx, x1, y1, x2, y2) {
    let color = ctx.strokeStyle
    ctx.strokeStyle = adjustedStyle(color)
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = color
}

export function enableButton(button) {
    button.classList.remove('bg-gray-500');
    button.classList.add('bg-white');
    button.classList.add('hover:bg-gray-300');
    button.disabled = false;
}

export function disableButton(button) {
    button.classList.add('bg-gray-500');
    button.classList.remove('bg-white');
    button.classList.remove('hover:bg-gray-300');
    button.disabled = true;
}

export function toggleButton(button) {
    if (button.classList.contains('bg-gray-400')) {
        button.classList.add('white');
        button.classList.remove('bg-gray-400');
        button.classList.add('hover:bg-gray-300');
        button.classList.remove('hover:bg-gray-600');
    } else if (button.classList.contains('bg-white')) {
        button.classList.remove('white');
        button.classList.add('bg-gray-400');
        button.classList.remove('hover:bg-gray-300');
        button.classList.add('hover:bg-gray-600');
    }
}