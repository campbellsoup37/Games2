import {
    font, colors, drawText, drawBox, drawOval, createDeckImg, drawCard, drawLine, enableButton, disableButton, toggleButton
} from './graphics_tools.js'

import {
    WrappedDOMElement, PanelInteractable
} from './interactable.js'

export class ScoreSheet extends WrappedDOMElement {
    constructor(prefix, canvas) {
        super(document.getElementById(`${prefix}ScoreSheetContainer`));
        this.margin = 5;
        this.scoreVSpacing = 20;
        this.lineV = 4;
        this.sortByHeight = 30;
        this.bidInfoHeight = 20;
        this.buttonWidth = 60;
        this.dealerHWidth = 10;
        this.scoreMargin = 10

        let parent = this;
        this.canvas = canvas

        this.scoreSheetHeader = new PanelInteractable(
            document.getElementById(`${prefix}ScoreSheetHeaderContainer`),
            document.getElementById(`${prefix}ScoreSheetHeaderCanvas`),
            true
        );
        this.scoreSheetHeader.paint = function () {
            this.panel.container.style.height = parent.headerHeight() + 'px';
            this.fillContainer();
            this.clear();
            parent.paintHeader(this.ctx);
        };

        this.scoreSheetScroll = new PanelInteractable(
            document.getElementById(`${prefix}ScoreSheetScrollContainer`),
            document.getElementById(`${prefix}ScoreSheetScrollCanvas`),
            true
        );
        this.scoreSheetScroll.paint = function () {
            this.panel.container.style.height = parent.scrollHeight() + 'px';
            this.fillContainer(() => {
                this.panel.canvas.height = parent.scrollCanvasHeight();
            });
            this.clear();
            parent.paintScroll(this.ctx);
        };

        this.interactables = [
            this.scoreSheetHeader,
            this.scoreSheetScroll
        ];

        this.buttons = [
            document.getElementById(`${prefix}SortBySeat`),
            document.getElementById(`${prefix}SortByScore`)
        ];
        for (let i = 0; i < this.buttons.length; i++) {
            this.buttons[i].addEventListener('click', () => {
                if (this.sortBy != i) {
                    toggleButton(this.buttons[this.sortBy]);
                    this.sortBy = i;
                    toggleButton(this.buttons[this.sortBy]);
                }
            });
        }
        this.sortBy = 0;
        toggleButton(this.buttons[0]);
    }

    height() {
        let height = this.scoreVSpacing * this.getRounds().length
            + this.headerHeight()
            + this.footerHeight() + 2;
        let m = 12;
        return Math.min(
            height,
            this.canvas.client.cachedHeight - 7 * m - 1 - this.canvas.minChatHeight
        )
    }

    headerHeight() {
        let numRows = this.options && this.options.teams ? 2 : 1;
        return this.margin + this.scoreVSpacing * numRows + this.lineV / 2;
    }

    footerHeight() {
        return this.sortByHeight + 2 * this.margin;
    }

    scrollHeight() {
        return this.height() - this.headerHeight() - this.footerHeight();
    }

    scrollCanvasHeight() {
        return this.scoreVSpacing * this.rounds.length + this.lineV / 2;
    }

    paintHeader(ctx) {
        let N = this.players.length;
        let wid = (this.width() - 4 * this.margin - 2 * this.dealerHWidth) / N;
        let currentX = 3 * this.margin + 2 * this.dealerHWidth;

        let height = this.headerHeight();

        // horizontal line
        ctx.fillStyle = 'black';
        drawLine(ctx,
            currentX,
            height,
            this.width() - this.margin,
            height
        );

        let indices = [];
        if (this.options.teams) {
            let teamX = currentX;
            for (const team of this.teams) {
                if (team.members.length == 0) {
                    continue;
                }

                let teamWid = wid * team.members.length;
                ctx.fillStyle = 'white';
                drawBox(ctx,
                    teamX + 1, this.margin, teamWid - 2, this.scoreVSpacing,
                    10, colors[team.number]
                );
                drawText(ctx,
                    team.name.substring(0, 15),
                    teamX + teamWid / 2,
                    this.margin + this.scoreVSpacing / 2,
                    1, 1,
                    font.bold,
                    colors[team.number],
                    teamWid - 6
                );
                indices = indices.concat(team.members);
                teamX += teamWid;
            }
        } else {
            indices = [...Array(this.players.length).keys()];
        }

        let myPlayer = this.canvas.client.state.baseState.myPlayer
        for (let j = 0; j < N; j++) {
            let i = indices[j];
            let player = this.players[i];

            // name
            drawText(ctx,
                player.name.substring(0, 15),
                currentX + wid / 2,
                height - this.scoreVSpacing / 2 - this.lineV / 2,
                1, 1,
                myPlayer && player.id == myPlayer.id ? font.bold : font.basic,
                'black',
                wid - 6
            );

            if (j > 0) {
                drawLine(ctx,
                    currentX,
                    height - this.scoreVSpacing - this.lineV / 2,
                    currentX,
                    height
                );
            }

            currentX += wid;
        }
    }

    paintScroll(ctx) {
        let N = this.players.length;
        let wid = (this.width() - 4 * this.margin - 2 * this.dealerHWidth) / N;

        let height = this.scrollCanvasHeight();

        // dealers and hand sizes
        for (let i = 0; i < this.rounds.length; i++) {
            let round = this.rounds[i];

            // TODO
            //let info = '';
            //if (mode == 'Oh Hell') {
            //    info = round.handSize;
            //} else if (mode == 'Hearts') {
            //    if (round.pass == 0) {
            //        info = 'K';
            //    } else if (round.pass > 0) {
            //        info = 'L';
            //        if (round.pass > 1) {
            //            info += round.pass;
            //        }
            //    } else if (round.pass < 0) {
            //        info = 'R';
            //        if (round.pass < -1) {
            //            info += (-round.pass);
            //        }
            //    }
            //}
            let info = round.handSize

            drawText(ctx,
                info,
                this.margin + this.dealerHWidth / 2,
                this.scoreVSpacing * (i + 0.5),
                1, 1,
                font.basic, 'black'
            );
            drawText(ctx,
                this.playersUnsorted[round.dealer].name.substring(0, 1),
                2 * this.margin + 1.5 * this.dealerHWidth,
                this.scoreVSpacing * (i + 0.5),
                1, 1,
                font.basic, 'black'
            );
        }

        // rest
        let currentX = 3 * this.margin + 2 * this.dealerHWidth;

        let colCount = this.options.teams ? this.teams.length : this.players.length;
        for (let i = 0; i < colCount; i++) {
            let members = this.options.teams ? this.teams[i].members.map(j => this.players[j]) : [this.players[i]];
            let scoresList = members[0].scores;
            if (!scoresList) {
                scoresList = []
            }
            let fullWid = wid * members.length;

            if (i > 0) {
                drawLine(ctx, currentX, 0, currentX, height);
            }

            for (let j = 0; j < this.rounds.length; j++) {
                let score = j < scoresList.length ? scoresList[j] : '';

                let k = members.length;
                let fnt = font.basic;
                let b = 0;


                // TODO don't paint bid chips for hearts
                // bid chips
                b = (fnt == font.basic ? 13 : 9) + 3;
                let chipStart = j < scoresList.length ? 0 : this.margin + b - wid;
                let chipSpacing = j < scoresList.length ? this.margin + b : wid;
                for (const p of members) {
                    if (p.bids && j < p.bids.length) {
                        ctx.fillStyle = 'rgba(200, 200, 200, 0.7)';

                        // if (p.takens === undefined || p.takens.length < p.bid.length) {
                        //     ctx.fillStyle = 'rgba(200, 200, 200, 0.7)';
                        // } else if (p.takens[j] == p.bids[j]) {
                        //     ctx.fillStyle = 'rgb(255, 175, 175)';
                        // } else {
                        //     ctx.fillStyle = 'rgb(125, 255, 125)';
                        // }

                        drawOval(ctx,
                            currentX + 1 + fullWid - chipSpacing * k - chipStart,
                            this.scoreVSpacing * (j + 0.5) - b / 2,
                            b, b
                        );
                        drawText(ctx,
                            p.bids[j],
                            currentX + 1 + fullWid - chipSpacing * k - chipStart + b / 2,
                            this.scoreVSpacing * (j + 0.5),
                            1, 1,
                            fnt, 'black'
                        );
                    }
                    k--;
                }

                // scores
                k = members.length;
                drawText(ctx,
                    score,
                    currentX + 1 + fullWid / 2 - this.margin * k / 2 - b * k / 2,
                    this.scoreVSpacing * (j + 0.5),
                    1, 1,
                    fnt, 'black'
                );
            }

            currentX += fullWid;
        }
    }

    paint() {
        if (!this.isShown()) {
            return;
        }
        super.paint();

        this.options = this.getOptions();
        this.playersUnsorted = this.getPlayers();
        this.players = this.playersUnsorted.map(p => p);
        if (this.options.teams) {
            this.teams = this.getTeams().map(t => t).filter(t => t.members.length > 0);
        }
        this.rounds = this.getRounds();

        if (!this.players.length) {
            return;
        }

        if (this.sortBy == 1) {
            let sign = this.canvas.client.state.baseState.sortScoresDescending ? 1 : -1
            if (this.options.teams) {
                this.teams.sort((t1, t2) => sign * Math.sign(t2.members[0].score - t1.members[0].score));
            } else {
                this.players.sort((p1, p2) => sign * Math.sign(p2.score - p1.score));
            }
        }

        for (const inter of this.interactables) {
            inter.paint();
        }
    }
}