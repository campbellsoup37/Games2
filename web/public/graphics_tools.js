export var font = {
    basic: "13px Arial",
    bold: "bold 13px Arial",
    small: "bold 9px Arial",
    medium: "bold 24px Arial",
    large: "bold 40px Arial",
    title: "bold 52px Arial"
}
export var colors = [
    'blue', 'red', 'green', 'magenta', 'cyan',
    'orange', 'pink', 'yellow', 'gray', 'black'
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

export function drawText(ctx, text, x, y, posx, posy, fnt, style, maxWidth) {
    if (arguments.length < 7) {
        fnt = font.basic;
    }
    if (arguments.length < 8) {
        style = 'black';
    }

    ctx.font = fnt;
    ctx.fillStyle = style;
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

export function drawBox(ctx, x, y, width, height, roundness, thickBorderColor, noBorder, noFill) {
    if (!noFill) {
        ctx.beginPath();
        ctx.moveTo(x + roundness, y);
        ctx.lineTo(x + width - roundness, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + roundness);
        ctx.lineTo(x + width, y + height - roundness);
        ctx.quadraticCurveTo(x + width, y + height, x + width - roundness, y + height);
        ctx.lineTo(x + roundness, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - roundness);
        ctx.lineTo(x, y + roundness);
        ctx.quadraticCurveTo(x, y, x + roundness, y);
        ctx.closePath();
        ctx.fill();
    }

    if (!noBorder) {
        let color = ctx.strokeStyle;
        ctx.strokeStyle = thickBorderColor === undefined ? 'black' : thickBorderColor;
        ctx.lineWidth = thickBorderColor === undefined ? 1 : 2;

        ctx.beginPath();
        ctx.moveTo(x + roundness, y);
        ctx.lineTo(x + width - roundness, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + roundness);
        ctx.lineTo(x + width, y + height - roundness);
        ctx.quadraticCurveTo(x + width, y + height, x + width - roundness, y + height);
        ctx.lineTo(x + roundness, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - roundness);
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
        ctx.fill();
    } else {
        ctx.stroke();
    }
}

var rowCodeInv = [3, 1, 2, 0]
export function createDeckImg(id) {
    let obj = { img: document.getElementById(id) }
    obj['width'] = obj.img.width / 9
    obj['height'] = obj.img.height / 6
    return obj
}

export function drawCard(ctx, card, x, y, scale, deckImg, dark, maxY, thickBorderColor, angle) {
    let cardNumber = card.num == 0 ? 52 : (card.num - 1) % 13 + 13 * rowCodeInv[card.suit];
    let col = cardNumber % 9;
    let row = (cardNumber - col) / 9;

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

    ctx.drawImage(
        deckImg.img,
        col * cw1, row * ch1, cw1, diff / scale,
        x0, y0, cw1 * scale, diff
    );

    if (dark) {
        ctx.fillStyle = 'rgba(127, 127, 127, 0.3)'
        drawBox(ctx, x0, y0, cw1 * scale, diff, 15, undefined, true);
    }

    if (thickBorderColor !== undefined) {
        drawBox(ctx, x0, y0, cw1 * scale, ch1 * scale, 7, thickBorderColor, false, true);
    }

    if (angle !== undefined) {
        ctx.rotate(-angle)
        ctx.translate(-x, -y)
    }
}

export function drawLine(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
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