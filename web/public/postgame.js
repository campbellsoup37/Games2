import {
    Card
} from './basics.js'

import {
    font, colors, smallCardScale, drawText, drawBox, drawOval, createDeckImg, drawCard, drawLine, enableButton, disableButton, toggleButton
} from './graphics_tools.js'

import {
    CanvasInteractable, WrappedDOMElement, PanelInteractable
} from './interactable.js'

export class PostGamePage extends WrappedDOMElement {
    constructor(canvas) {
        super(document.getElementById('igPgTabDiv'), true);
        this.canvas = canvas

        this.scoreTab = new PostGamePlotTab(this, 0);
        this.winTab = new PostGamePlotTab(this, 1);
        this.summaryTab = new PostGameSummaryTab(this, 2);
        this.bidsTab = new PostGameBidsTab(this, 3);
        this.playsTab = new PostGamePlaysTab(this, 4);

        this.tabs = [
            this.scoreTab,
            this.winTab,
            this.summaryTab,
            this.bidsTab,
            this.playsTab
        ];
        this.interactables = this.tabs;

        this.buttons = [
            document.getElementById("igScores"),
            document.getElementById("igWinP"),
            document.getElementById("igSummary"),
            document.getElementById("igBids"),
            document.getElementById("igPlays"),
        ];
        for (let i = 0; i < this.buttons.length; i++) {
            this.buttons[i].addEventListener('click', () => { this.changeTab(i) });
        }
        this.tabSelected = 0;
        toggleButton(this.buttons[0]);
    }

    paint() {
        if (!this.canvas.client.state.paintPostGame()) {
            return;
        }

        this.tabs[this.tabSelected].paint();
    }

    setData(data) {
        let sortedScores = undefined;
        if (data.options.teams) {
            sortedScores = data.teams.filter(t => t.members.length > 0).map(function (t) {
                let p = data.players[t.members[0]];
                return {
                    name: t.name,
                    index: t.number,
                    score: p.scores.length == 0 ? 0 : p.scores[p.scores.length - 1]
                };
            });
        } else {
            sortedScores = data.players.map(function (p) {
                return {
                    name: p.name,
                    index: p.index,
                    score: p.scores.length == 0 ? 0 : p.scores[p.scores.length - 1]
                };
            });
        }
        let sign = this.canvas.client.state.baseState.sortScoresDescending ? 1 : -1
        sortedScores.sort((p1, p2) => sign * Math.sign(p2.score - p1.score));
        this.scoreTab.scoreBoard.sortedScores = sortedScores;
        this.winTab.scoreBoard.sortedScores = sortedScores;

        let plotDatas = undefined;
        if (data.options.teams) {
            plotDatas = data.teams.filter(t => t.members.length > 0).map(function (t) {
                let p = data.players[t.members[0]];
                return {
                    name: t.name,
                    index: t.number,
                    scores: [0].concat(p.scores),
                    wbProbs: [100 / data.players.length].concat(p.wbProbs.map(x => 100 * x))
                };
            });
        } else {
            plotDatas = data.players.map(function (p) {
                return {
                    name: p.name,
                    index: p.index,
                    scores: [0].concat(p.scores),
                    wbProbs: [100 / data.players.length].concat(p.wbProbs.map(x => 100 * x))
                };
            });
        }
        let ticks = [''].concat(data.rounds.map(r => r.handSize));
        for (const data of plotDatas) {
            this.scoreTab.scorePlot.addData(data.scores, data.index, data.name);
            this.winTab.scorePlot.addData(data.wbProbs, data.index, data.name);
        }
        this.scoreTab.scorePlot.addTicks(ticks);
        this.winTab.scorePlot.addTicks(ticks);

        this.summaryTab.addData(data);
        this.bidsTab.addData(data);
        this.playsTab.addData(data);
    }

    changeTab(tab) {
        this.tabs[this.tabSelected].hide();
        toggleButton(this.buttons[this.tabSelected]);
        this.tabSelected = tab;
        this.tabs[this.tabSelected].show();
        toggleButton(this.buttons[this.tabSelected]);
    }

    clearData() {
        this.scoreTab.scorePlot.initialize();
        this.winTab.scorePlot.initialize();
    }
}

class PostGameTab extends CanvasInteractable {
    constructor(page, index) {
        super();
        this.page = page;
        this.index = index;
    }

    x() { return this.page.x(); }
    y() { return this.page.y(); }
    width() { return this.page.width(); }
    height() { return this.page.height(); }

    isShown() {
        return this.page.tabSelected == this.index;
    }

    hide() {
        for (const element of this.elements) {
            element.style.display = 'none';
        }
    }

    show() {
        for (const element of this.elements) {
            element.style.display = 'inline';
        }
    }
}

class Plot extends CanvasInteractable {
    constructor(ctx, offsetX, offsetY) {
        super();
        this.ctx = ctx;
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        this.mouseX = 0;
        this.mouseY = 0;
        this.axes = true;
        this.paddingX = 0.05;
        this.paddingY = 0.1;
        this.initialize();
    }

    initialize() {
        this.datas = [];

        this.minX = 0;
        this.maxX = 0;
        this.minY = 0;
        this.maxY = 0;
    }

    addData(data, color, name) {
        this.maxX = Math.max(this.maxX, data.length - 1);
        for (const y of data) {
            this.minY = Math.min(this.minY, y);
            this.maxY = Math.max(this.maxY, y);
        }
        this.datas.push({ data: data, color: colors[color], name: name });
    }

    setMinY(y) {
        this.minY = y;
    }

    setMaxY(y) {
        this.maxY = y;
    }

    addTicks(ticks) {
        this.ticks = ticks;
    }

    x0() {
        return this.x() - this.offsetX();
    }

    y0() {
        return this.y() - this.offsetY();
    }

    paint() {
        let nearestX = 0;
        if (this.isMoused()) {
            nearestX = Math.min(this.maxX, Math.max(this.minX, Math.round(this.mouseX)));
            this.highlight(nearestX);
        }

        if (this.axes) {
            this.ctx.strokeStyle = 'black';
            this.drawLine(0, this.minY, 0, this.maxY);
            if (this.minY <= 0 && 0 <= this.maxY) {
                this.drawLine(this.minX, 0, this.maxX, 0);
            }
        }

        if (this.ticks === undefined || this.ticks.length > 0) {
            for (let x = this.minX; x <= this.maxX; x++) {
                drawText(this.ctx,
                    this.ticks === undefined ? x : this.ticks[x],
                    this.x0() + this.canvasX(x), this.y0() + this.height() - 10, 1, 1, font.small, 'black');
            }
        }

        for (const data of this.datas) {
            this.ctx.strokeStyle = data.color;
            this.ctx.fillStyle = data.color;
            let x = 0;
            let y = 0;
            for (const newY of data.data) {
                this.drawPoint(x, newY);
                if (x > 0) {
                    this.drawLine(x - 1, y, x, newY);
                }
                x++;
                y = newY;
            }
        }

        if (this.isMoused()) {
            let ttW = 150;
            let ttH = 20 + 16 * this.datas.length;
            let ttY = this.height() / 2 - ttH / 2;
            let ttX = this.canvasX(nearestX + 0.5);
            if (ttX + ttW > this.width()) {
                ttX = this.canvasX(nearestX - (nearestX == this.minX ? 0.1 : 0.5)) - ttW;
            }

            this.ctx.fillStyle = 'white';
            drawBox(this.ctx, this.x0() + ttX, this.y0() + ttY, ttW, ttH, 10);

            // should I maybe not sort this every frame? doesn't really hurt my framerate
            let perm = [...Array(this.datas.length).keys()].sort((i, j) =>
                Math.sign(this.datas[j].data[nearestX] - this.datas[i].data[nearestX]));

            for (let i = 0; i < this.datas.length; i++) {
                this.ctx.fillStyle = this.datas[perm[i]].color;
                let y = this.height() / 2 + 16 * (i + 1 - this.datas.length / 2);
                drawOval(this.ctx, this.x0() + ttX + 8, this.y0() + y - 2, 4, 4, true);
                drawText(this.ctx, this.datas[perm[i]].name.substring(0, 10), this.x0() + ttX + 20, this.y0() + y, 0, 1, font.basic, 'black');
                drawText(this.ctx, this.datas[perm[i]].data[nearestX].toFixed(2), this.x0() + ttX + ttW - 15, this.y0() + y, 2, 1, font.basic, 'black');
            }
        }
    }

    updateMoused(x, y) {
        let ans = super.updateMoused(x, y);
        if (this.isMoused()) {
            this.mouseX = this.plotX(x - this.x());
            this.mouseY = this.plotY(y - this.y());
        }
        return ans;
    }

    canvasX(x) {
        return this.width() * this.paddingX + (x - this.minX) * (1 - 2 * this.paddingX) * this.width() / (this.maxX - this.minX);
    }

    canvasY(y) {
        return this.height() * (1 - this.paddingY) - (y - this.minY) * (1 - 2 * this.paddingY) * this.height() / (this.maxY - this.minY);
    }

    plotX(x) {
        return this.minX + (x - this.width() * this.paddingX) * (this.maxX - this.minX) / ((1 - 2 * this.paddingX) * this.width());
    }

    plotY(y) {
        return this.minY - (y - this.height() * (1 - this.paddingY)) * (this.maxY - this.minY) / ((1 - 2 * this.paddingY) * this.height());
    }

    drawLine(x1, y1, x2, y2) {
        drawLine(this.ctx, this.x0() + this.canvasX(x1), this.y0() + this.canvasY(y1), this.x0() + this.canvasX(x2), this.y0() + this.canvasY(y2));
    }

    drawPoint(x, y) {
        drawOval(this.ctx, this.x0() + this.canvasX(x) - 2, this.y0() + this.canvasY(y) - 2, 4, 4, true);
    }

    highlight(x) {
        this.ctx.fillStyle = 'rgb(192, 192, 192)';
        let x1 = x == this.minX ? this.canvasX(x - 0.1) : this.canvasX(x - 0.5);
        let y1 = this.canvasY(this.maxY);
        let x2 = x == this.maxX ? this.canvasX(x + 0.1) : this.canvasX(x + 0.5);
        let y2 = this.canvasY(this.minY);
        drawBox(this.ctx, this.x0() + x1, this.y0() + y1, x2 - x1, y2 - y1, 10, 'rgb(192, 192, 192)');
    }
}

class PostGamePlotTab extends PostGameTab {
    constructor(page, index) {
        super(page, index);

        this.elements = [
            document.getElementById("igScoreBoardContainer"),
            document.getElementById("igScorePlotContainer")
        ];

        this.scoreBoard = new PanelInteractable(
            document.getElementById("igScoreBoardContainer"),
            document.getElementById("igScoreBoardCanvas"),
            true
        );
        this.scoreBoard.sortedScores = [];
        this.scoreBoard.paint = function () {
            this.clear();
            this.fillContainer();

            drawText(this.ctx, 'Final scores', this.width() / 2, 25, 1, 1, font.bold, 'black');

            let place = 0;
            let current = 999999999;
            let i = 0;
            for (const score of this.sortedScores) {
                if (score.score != current) {
                    place = i + 1;
                    current = score.score;
                }
                this.ctx.fillStyle = colors[score.index];
                drawOval(this.ctx, 8, 50 + 16 * i - 2, 4, 4, true);
                drawText(this.ctx, place + '. ' + score.name, 20, 50 + 16 * i, 0, 1, font.basic, 'black');
                drawText(this.ctx, score.score, this.width() - 15, 50 + 16 * i, 2, 1, font.basic, 'black');
                i++;
            }
        };

        this.scorePlotPanel = new PanelInteractable(
            document.getElementById("igScorePlotContainer"),
            document.getElementById("igScorePlotCanvas"),
            true
        );
        let panel = this.scorePlotPanel;
        this.scorePlot = new Plot(panel.ctx, () => panel.x(), () => panel.y());
        this.scorePlot.x = function () { return panel.x(); };
        this.scorePlot.y = function () { return panel.y(); };
        this.scorePlot.width = function () { return panel.width(); };
        this.scorePlot.height = function () { return panel.height(); };
        this.scorePlotPanel.interactables = [this.scorePlot];
        this.scorePlotPanel.paint = () => {
            panel.clear();
            panel.fillContainer();
            this.scorePlot.paint();
        };

        this.interactables = [this.scoreBoard, this.scorePlotPanel];
    }

    paint() {
        this.scoreBoard.paint();
        this.scorePlotPanel.paint();
    }
}

class PostGameSummaryTab extends PostGameTab {
    constructor(page, index) {
        super(page, index);

        this.elements = [
            document.getElementById("igSummaryTabContainer")
        ];

        this.headerHeight = 35;
        this.margin = 4;
        this.columnXs = [
            7 / 32, 13 / 32, 19 / 32, 22 / 32, 25 / 32, 28 / 32
        ];

        let parent = this;
        class SummaryPanel extends PanelInteractable {
            constructor() {
                super(
                    document.getElementById("igSummaryContainer"),
                    document.getElementById("igSummaryCanvas"),
                    true
                );
            }

            addData(data) {
                this.plots = [];
                this.interactables = [];

                for (const player of parent.players) {
                    let plot = new Plot(this.ctx, () => this.x(), () => this.y());
                    plot.x = () => this.x() + this.width() * 9 / 32;
                    plot.y = () => this.y() + parent.headerHeight + player.index * (this.height() - parent.headerHeight - 2) / parent.players.length;
                    plot.width = () => this.width() / 4;
                    plot.height = () => (this.height() - parent.headerHeight - 2) / parent.players.length;

                    let bins = new Array(9).fill(0);
                    for (let i = 0; i < player.bids.length; i++) {
                        let delta = Math.max(-4, Math.min(4, player.takens[i] - player.bids[i]));
                        bins[delta + 4]++;
                    }

                    plot.addData(bins, 0, 'overtricks');
                    plot.setMinY(-0.4 * player.takens.length);
                    plot.setMaxY(Math.max(player.takens.length, 1));
                    plot.addTicks(['<-3', '-3', '-2', '-1', '0', '1', '2', '3', '>3']);
                    plot.axes = false;
                    this.interactables.push(plot);
                    this.plots.push(plot);
                }
            }

            paint() {
                super.paint();
                parent.paintHeader(this.ctx, this.width());
                parent.paintBody(this.ctx, this.width(), this.height());
                for (const plot of this.plots) {
                    plot.paint();
                }
            }
        }
        this.panel = new SummaryPanel();
        this.interactables = [this.panel];
    }

    addData(data) {
        this.options = data.options;
        this.players = data.players;
        this.lucks = data.players.map(p => p.lucks.reduce((a, b) => a + b, 0));
        this.diffs = data.players.map(p => p.diffs.reduce((a, b) => a + b, 0));
        this.bidScores = data.players.map(p => 10 * Math.exp(-p.hypoPointsLost.reduce((a, b) => a + b, 0) / 57));
        this.playScores = data.players.map(p => 10 * Math.exp(-p.mistakes.reduce((a, b) => a + b, 0) / 5));

        this.panel.addData(data);
    }

    paintHeader(ctx, width) {
        drawText(ctx, 'score', width * this.columnXs[0], this.headerHeight / 2, 1, 1, font.small, 'black');
        drawText(ctx, 'overtricks', width * this.columnXs[1], this.headerHeight / 2, 1, 1, font.small, 'black');
        drawText(ctx, 'bid performance', width * this.columnXs[2], this.headerHeight / 2, 1, 1, font.small, 'black');
        drawText(ctx, 'play performance', width * this.columnXs[3], this.headerHeight / 2, 1, 1, font.small, 'black');
        drawText(ctx, 'luck', width * this.columnXs[4], this.headerHeight / 2, 1, 1, font.small, 'black');
        drawText(ctx, 'difficulty', width * this.columnXs[5], this.headerHeight / 2, 1, 1, font.small, 'black');
    }

    paintBody(ctx, width, height) {
        let h = (height - this.headerHeight - 2) / this.players.length;
        for (let i = 0; i <= this.players.length; i++) {
            ctx.strokeStyle = '#C0C0C0';
            drawLine(ctx, this.margin, this.headerHeight + i * h, width - this.margin, this.headerHeight + i * h);

            if (i == this.players.length) {
                break;
            }

            let player = this.players[i];
            let h0 = this.headerHeight + player.index * h + h / 2;

            // columns
            drawText(ctx, player.name, 2 * this.margin, h0, 0, 1, font.basic, this.options.teams ? colors[player.team] : 'black');
            drawText(ctx, player.score, width * this.columnXs[0], h0, 1, 1, font.basic, 'black');
            let bidScore = this.bidScores[i];
            drawText(ctx, !player.human && bidScore > 9.99 ? '--' : bidScore.toFixed(1), width * this.columnXs[2], h0, 1, 1, font.basic, 'black');
            let playScore = this.playScores[i];
            drawText(ctx, !player.human && playScore > 9.99 ? '--' : playScore.toFixed(1), width * this.columnXs[3], h0, 1, 1, font.basic, 'black');
            drawText(ctx, this.lucks[i].toFixed(1), width * this.columnXs[4], h0, 1, 1, font.basic, 'black');
            drawText(ctx, this.diffs[i].toFixed(1), width * this.columnXs[5], h0, 1, 1, font.basic, 'black');
        }
    }

    paint() {
        this.panel.paint();
    }
}

class PostGameBidsTab extends PostGameTab {
    constructor(page, index) {
        super(page, index);

        this.elements = [
            document.getElementById("igBidsTabContainer")
        ];

        this.headerHeight = 35;
        this.margin = 4;
        this.columnXs = [
            3 / 16, 3 / 8, 5 / 8, 25 / 32, 26.75 / 32, 28.5 / 32, 30.5 / 32
        ];

        let parent = this;
        class BidsPanel extends PanelInteractable {
            constructor() {
                super(
                    document.getElementById("igBidsContainer"),
                    document.getElementById("igBidsCanvas"),
                    true
                );
            }

            addData(data) {
                this.plots = [];
                this.interactables = [];
                for (let i = 0; i < parent.numRounds; i++) {
                    let roundPlots = [];
                    for (const player of parent.players) {
                        let plot = new Plot(this.ctx, () => this.x(), () => this.y());
                        plot.x = () => this.x() + this.width() / 2;
                        plot.y = () => this.y() + parent.headerHeight + player.index * (this.height() - parent.headerHeight - 2) / parent.players.length;
                        plot.width = () => this.width() / 4;
                        plot.height = () => (this.height() - parent.headerHeight - 2) / parent.players.length;
                        plot.isShown = () => i == parent.selected;
                        plot.wheel = this.wheel;
                        if (i < player.bidQs.length) {
                            plot.addData(player.bidQs[i], 0, 'Prob (%)');
                        }
                        plot.setMinY(-40);
                        plot.setMaxY(100);
                        plot.axes = false;
                        this.interactables.push(plot);
                        roundPlots.push(plot);
                    }
                    this.plots.push(roundPlots);
                }
            }

            wheel(y) {
                parent.deltaRound(Math.sign(y));
            }

            paint() {
                super.paint();
                parent.paintHeader(this.ctx, this.width());
                parent.paintBody(this.ctx, this.width(), this.height());
                for (const plot of this.plots[parent.selected]) {
                    plot.paint();
                }
            }
        }
        this.panel = new BidsPanel();
        this.interactables = [this.panel];
    }

    addData(data) {
        this.options = data.options;
        this.numRounds = data.players[0].hands.length;
        let rounds = data.rounds.map(r => r.handSize);
        this.dealers = data.rounds.map(r => r.dealer);

        let div = document.getElementById('igBidsButtonContainer');
        while (div.firstChild) {
            div.removeChild(div.firstChild);
        }
        this.buttons = new Array(this.numRounds);
        for (let i = 0; i < this.numRounds; i++) {
            let button = document.createElement('button');
            button.classList.add(
                'bg-white', 'rounded-lg', 'border', 'border-black', 'w-5', 'h-5',
                'font-bold', 'text-sm', 'select-none', 'hover:bg-gray-300'
            );
            button.innerHTML = rounds[i];
            button.addEventListener('click', () => { this.selectRound(i); });
            div.appendChild(button);
            this.buttons[i] = button;
        }

        this.selected = undefined;
        this.selectRound(0);

        this.players = data.players;
        this.trumps = data.trumps;

        this.panel.addData(data);
    }

    wheel(y) {
        this.deltaRound(Math.sign(y));
    }

    deltaRound(e) {
        let i = Math.max(0, Math.min(this.buttons.length - 1, this.selected + e));
        this.selectRound(i);
    }

    selectRound(i) {
        if (this.selected !== undefined) {
            toggleButton(this.buttons[this.selected]);
        }
        this.selected = i;
        toggleButton(this.buttons[this.selected]);
    }

    paintHeader(ctx, width) {
        drawText(ctx, 'trump', width * this.columnXs[0], this.headerHeight / 2, 1, 1, font.small, 'black');
        drawText(ctx, 'hand', width * this.columnXs[1], this.headerHeight / 2, 1, 1, font.small, 'black');
        drawText(ctx, 'distribution', width * this.columnXs[2], this.headerHeight / 2, 1, 1, font.small, 'black');
        drawText(ctx, 'bid', width * this.columnXs[3], this.headerHeight / 2, 1, 1, font.small, 'black');
        drawText(ctx, 'took', width * this.columnXs[4], this.headerHeight / 2, 1, 1, font.small, 'black');
        drawText(ctx, 'AI bid', width * this.columnXs[5], this.headerHeight / 2, 1, 1, font.small, 'black');
        drawText(ctx, 'difficulty', width * this.columnXs[6], this.headerHeight / 2, 1, 1, font.small, 'black');
    }

    paintBody(ctx, width, height) {
        let h = (height - this.headerHeight - 2) / this.players.length;
        for (let i = 0; i <= this.players.length; i++) {
            ctx.strokeStyle = '#C0C0C0';
            drawLine(ctx, this.margin, this.headerHeight + i * h, width - this.margin, this.headerHeight + i * h);

            if (i == this.players.length) {
                break;
            }

            let player = this.players[i];
            let h0 = this.headerHeight + player.index * h + h / 2;
            let deckImgSmall = this.page.canvas.client.vars.deckImgSmall

            // name
            drawText(ctx, player.name, 2 * this.margin, h0, 0, 1, font.basic, this.options.teams ? colors[player.team] : 'black');

            // trump
            if (player.index == this.dealers[this.selected]) {
                drawCard(ctx, new Card(), width * this.columnXs[0] - 4, h0 + 30 - 4, smallCardScale, deckImgSmall, false, h0 + h / 2, undefined);
                drawCard(ctx, new Card(), width * this.columnXs[0] - 2, h0 + 30 - 2, smallCardScale, deckImgSmall, false, h0 + h / 2, undefined);
                drawCard(ctx, this.trumps[this.selected], width * this.columnXs[0], h0 + 30, smallCardScale, deckImgSmall, false, h0 + h / 2, undefined);
            }

            // hand
            let hand = player.hands[this.selected];
            for (let j = 0; j < hand.length; j++) {
                drawCard(ctx, hand[j], width * this.columnXs[1] + 10 * (j - (hand.length - 1) / 2), h0 + 30, smallCardScale, deckImgSmall, false, h0 + h / 2, undefined)
            }

            // distribution


            // bid, took, ai bid, difficulty
            drawText(ctx,
                this.selected < player.bids.length ? player.bids[this.selected] : '--',
                width * this.columnXs[3], h0, 1, 1, font.basic, 'black');
            let madeColor = 'black';
            if (this.selected < player.takens.length) {
                player.takens[this.selected] == player.bids[this.selected] ? 'green' : 'red';
            }
            drawText(ctx,
                this.selected < player.takens.length ? player.takens[this.selected] : '--',
                width * this.columnXs[4], h0, 1, 1, font.basic,
                madeColor);
            drawText(ctx,
                this.selected < player.aiBids.length ? player.aiBids[this.selected] : '--',
                width * this.columnXs[5], h0, 1, 1, font.basic, 'black');
            let dScale = 255 * (player.diffs[this.selected] - 1) / 9;
            drawText(ctx,
                this.selected < player.diffs.length ? player.diffs[this.selected].toFixed(1) : '--',
                width * this.columnXs[6], h0, 1, 1, font.basic, `rgb(${dScale}, ${0.75 * (255 - dScale)}, 0)`);
        }
    }

    paint() {
        this.panel.paint();
    }
}

class PostGamePlaysTab extends PostGameTab {
    constructor(page, index) {
        super(page, index);

        this.elements = [
            document.getElementById("igPlaysTabContainer")
        ];

        this.headerHeight = 35;
        this.margin = 4;
        this.columnXs = [
            3 / 16, 5.5 / 16, 5 / 8, 7 / 8
        ];

        let parent = this;
        class PlaysPanel extends PanelInteractable {
            constructor() {
                super(
                    document.getElementById("igPlaysContainer"),
                    document.getElementById("igPlaysCanvas"),
                    true
                );
            }

            wheel(y) {
                parent.deltaRound(Math.sign(y));
            }

            paint() {
                super.paint();
                parent.paintHeader(this.ctx, this.width());
                parent.paintBody(this.ctx, this.width(), this.height());
            }
        }
        this.panel = new PlaysPanel();
        this.interactables = [this.panel];
    }

    addData(data) {
        this.options = data.options;
        this.numRounds = data.players[0].hands.length;
        this.numTricks = new Array(this.numRounds);

        this.rounds = data.rounds.map(r => r.handSize);
        this.dealers = data.rounds.map(r => r.dealer);
        this.claims = data.claims;

        let div = document.getElementById('igPlaysRoundsButtonContainer');
        while (div.firstChild) {
            div.removeChild(div.firstChild);
        }
        this.buttons0 = new Array(this.numRounds);
        for (let i = 0; i < this.numRounds; i++) {
            let button = document.createElement('button');
            button.classList.add(
                'bg-white', 'rounded-lg', 'border', 'border-black', 'w-5', 'h-5',
                'font-bold', 'text-sm', 'select-none', 'hover:bg-gray-300'
            );
            button.innerHTML = this.rounds[i];
            button.addEventListener('click', () => {
                this.selectRound(i);
                this.selectTrick(0);
            });
            div.appendChild(button);
            this.buttons0[i] = button;

            let min = Math.min(...data.players.map(p => p.plays[i].length));
            let max = Math.max(...data.players.map(p => p.plays[i].length));

            this.numTricks[i] = max;
            if (max == 0 || (min == max && max < this.rounds[i] && this.claims[i] != -1)) {
                this.numTricks[i]++;
            }
        }

        this.selected0 = undefined;
        this.selected1 = undefined;
        this.selectRound(0);
        this.selectTrick(0);

        this.players = data.players;
        this.trumps = data.trumps;
        this.leaders = data.leaders;
        this.winners = data.winners;

        // should I put this mess server-side?
        this.hands = new Array(this.players.length);
        this.playIndices = new Array(this.players.length);
        this.wants = new Array(this.players.length);
        for (let i = 0; i < this.players.length; i++) {
            let player = this.players[i];
            this.hands[i] = new Array(this.numRounds);
            this.playIndices[i] = new Array(this.numRounds);
            this.wants[i] = new Array(this.numRounds);
            for (let j = 0; j < this.numRounds; j++) {
                this.hands[i][j] = new Array(this.numTricks[j]);
                this.playIndices[i][j] = new Array(this.numTricks[j]);
                this.wants[i][j] = new Array(this.numTricks[j]);

                let hand = player.hands[j];
                let want = player.bids[j];
                for (let k = 0; k < this.numTricks[j]; k++) {
                    this.hands[i][j][k] = hand;
                    hand = hand.map(c => c);
                    if (player.plays[j][k] !== undefined) {
                        for (let l = 0; l < hand.length; l++) {
                            if (hand[l].matches(player.plays[j][k])) {
                                this.playIndices[i][j][k] = l;
                                hand.splice(l, 1);
                                break;
                            }
                        }
                    } else if (k >= this.leaders[j].length) {
                        if (k == 0) {
                            this.leaders[j][k] = (this.dealers[j] + 1) % this.players.length;
                        } else {
                            this.leaders[j][k] = this.winners[j][k - 1];
                        }
                    }
                    this.wants[i][j][k] = want;
                    if (i == this.winners[j][k]) {
                        want--;
                    }
                }
            }
        }
    }

    wheel(y) {
        this.deltaRound(Math.sign(y));
    }

    deltaRound(e) {
        if (e == -1) {
            if (this.selected1 == 0 && this.selected0 > 0) {
                this.selectRound(this.selected0 - 1);
                this.selectTrick(this.buttons1.length - 1);
            } else if (this.selected1 > 0) {
                this.selectTrick(this.selected1 - 1);
            }
        } else {
            if (this.selected1 == this.buttons1.length - 1 && this.selected0 < this.buttons0.length - 1) {
                this.selectRound(this.selected0 + 1);
                this.selectTrick(0);
            } else if (this.selected1 < this.buttons1.length - 1) {
                this.selectTrick(this.selected1 + 1);
            }
        }
    }

    selectRound(i) {
        if (i == this.selected0) {
            return;
        }

        if (this.selected0 !== undefined) {
            toggleButton(this.buttons0[this.selected0]);
        }
        this.selected0 = i;
        toggleButton(this.buttons0[this.selected0]);

        let div = document.getElementById('igPlaysTricksButtonContainer');
        while (div.firstChild) {
            div.removeChild(div.firstChild);
        }
        this.buttons1 = new Array(this.numTricks[i]);
        for (let j = 1; j <= this.numTricks[i]; j++) {
            let button = document.createElement('button');
            button.classList.add(
                'bg-white', 'rounded-lg', 'border', 'border-black', 'w-5', 'h-5',
                'font-bold', 'text-sm', 'select-none', 'hover:bg-gray-300'
            );
            button.innerHTML = j;
            button.addEventListener('click', () => {
                this.selectTrick(j - 1);
            });
            div.appendChild(button);
            this.buttons1[j - 1] = button;
        }
        this.selected1 = undefined;
    }

    selectTrick(j) {
        if (j == this.selected1) {
            return;
        }

        if (this.selected1 !== undefined) {
            toggleButton(this.buttons1[this.selected1]);
        }
        this.selected1 = j;
        toggleButton(this.buttons1[this.selected1]);
    }

    paintHeader(ctx, width) {
        drawText(ctx, 'trump', width * this.columnXs[0], this.headerHeight / 2, 1, 1, font.small, 'black');
        drawText(ctx, 'led/won', width * this.columnXs[1], this.headerHeight / 2, 1, 1, font.small, 'black');
        drawText(ctx, 'hand', width * this.columnXs[2], this.headerHeight / 2, 1, 1, font.small, 'black');
        drawText(ctx, 'tricks wanted', width * this.columnXs[3], this.headerHeight / 2, 1, 1, font.small, 'black');
    }

    paintBody(ctx, width, height) {
        let h = (height - this.headerHeight - 2) / this.players.length;
        for (let i = 0; i <= this.players.length; i++) {
            ctx.strokeStyle = '#C0C0C0';
            drawLine(ctx, this.margin, this.headerHeight + i * h, width - this.margin, this.headerHeight + i * h);

            if (i == this.players.length) {
                break;
            }

            let player = this.players[i];
            let h0 = this.headerHeight + player.index * h + h / 2;
            let deckImgSmall = this.page.canvas.client.vars.deckImgSmall

            // name
            drawText(ctx, player.name, 2 * this.margin, h0, 0, 1, font.basic, this.options.teams ? colors[player.team] : 'black');

            // trump
            if (player.index == this.dealers[this.selected0]) {
                drawCard(ctx, new Card(), width * this.columnXs[0] - 4, h0 + 30 - 4, smallCardScale, deckImgSmall, false, h0 + h / 2, undefined);
                drawCard(ctx, new Card(), width * this.columnXs[0] - 2, h0 + 30 - 2, smallCardScale, deckImgSmall, false, h0 + h / 2, undefined);
                drawCard(ctx, this.trumps[this.selected0], width * this.columnXs[0], h0 + 30, smallCardScale, deckImgSmall, false, h0 + h / 2, undefined);
            }

            // leader/winner/claim
            let leader = player.index == this.leaders[this.selected0][this.selected1];
            let winner = player.index == this.winners[this.selected0][this.selected1];
            let claimer = player.index == this.claims[this.selected0] && this.selected1 == this.numTricks[this.selected0] - 1;
            if (leader) {
                ctx.fillStyle = 'rgb(200, 200, 200)';
                drawOval(ctx, width * this.columnXs[1] - 8 - (winner ? 10 : 0) - (claimer ? 30 : 0), h0 - 8, 16, 16);
                drawText(ctx, '>', width * this.columnXs[1] - (winner ? 10 : 0) - (claimer ? 30 : 0), h0, 1, 1, font.basic, 'black');
            }
            if (winner) {
                ctx.fillStyle = 'rgb(175, 175, 0)';
                drawOval(ctx, width * this.columnXs[1] - 8 + (leader ? 10 : 0), h0 - 8, 16, 16);
                drawText(ctx, 'w', width * this.columnXs[1] + (leader ? 10 : 0), h0, 1, 1, font.basic, 'black');
            }
            if (claimer) {
                ctx.fillStyle = 'rgb(225, 175, 225)';
                drawOval(ctx, width * this.columnXs[1] - 25 + (leader ? 10 : 0), h0 - 12, 50, 24);
                drawText(ctx, 'claim', width * this.columnXs[1] + (leader ? 10 : 0), h0, 1, 1, font.basic, 'black');
            }

            // hand
            let hand = this.hands[i][this.selected0][this.selected1];
            for (let j = 0; j < hand.length; j++) {
                drawCard(ctx,
                    hand[j],
                    width * this.columnXs[2] + 30 * (j - (hand.length - 1) / 2),
                    h0 + h / 2 + 15 - (j == this.playIndices[i][this.selected0][this.selected1] ? 15 : 0),
                    smallCardScale, deckImgSmall, false, h0 + h / 2, undefined);
            }
            for (let j = 0; j < hand.length; j++) {
                let x = width * this.columnXs[2] + 30 * (j - (hand.length - 1) / 2);
                let prob = this.selected1 < player.makingProbs[this.selected0].length ? player.makingProbs[this.selected0][this.selected1][j][1] : -1;
                if (prob != -1) {
                    ctx.fillStyle = 'white';
                    drawOval(ctx, x - 12, h0 - h / 2 + 15 - 8, 24, 16, true);
                    ctx.strokeStyle = 'black';
                    drawOval(ctx, x - 12, h0 - h / 2 + 15 - 8, 24, 16, false);
                }
                drawText(ctx,
                    prob == -1 ? '' : (100 * prob).toFixed(0) + '%',
                    x, h0 - h / 2 + 15,
                    1, 1, font.small, `rgb(${255 * (1 - prob)}, ${0.75 * 255 * prob}, 0)`
                );
            }

            // wants
            let want = this.wants[i][this.selected0][this.selected1] !== undefined ? this.wants[i][this.selected0][this.selected1] : '--';
            drawText(ctx, want, width * this.columnXs[3], h0, 1, 1, font.basic, 'black');
        }
    }

    paint() {
        this.panel.paint();
    }
}