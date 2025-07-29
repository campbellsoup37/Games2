from _oh_hell import generate_spreadsheet
import numpy as np
import os
import pandas as pd
import sys

iter = 'base'

# x2 = 7.879 # Confidence p = 0.005
x2 = 15.13670523 # Confidence p = 0.0001
# x2 = 19.51142096464506 # Confidence p = 0.00001

for D in [1, 2]:
    for N in [11, 13]:
        print(f'D = {D}, N = {N}')
        fname = f'C:/Users/campb/data/oh_hell/{iter}/spreadsheet/N{N}_D{D}.txt'
        output_fname = sys.prefix.replace("\\", "/").rsplit("/", 1)[0] + f'/web/models/N{N}/D{D}/T0/ss.txt'
        if not os.path.exists(fname):
            os.makedirs(fname.rsplit('/', 1)[0], exist_ok=True)
            generate_spreadsheet(N, D, x2, fname, False)
        if os.path.exists(output_fname):
            continue

        df = pd.read_csv(fname).dropna().astype(int)
        df['p'] = df.eval('wins / (wins + losses)')
        df['bid'] = (df.p >= 15 / 31).astype(int)

        def get_cutoff(x):
            if len(x) < (13 if D == 2 else 12):
                return np.nan
            if not x.bid.eq(1).any():
                return 13
            return x.query('bid == 1').iloc[0].bidderCard

        card_names = pd.Series(['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A', '-'])

        ss = df.sort_values('bidderCard').groupby(['trumpCard', 'bidCode']).apply(get_cutoff)

        if D == 1:
            sses = [ss]
            for t in range(1, 13):
                new_ss = ss.copy().reset_index()
                new_ss.trumpCard = t
                new_ss[0] = new_ss[0].map(lambda x: x + (-1 if t >= x else 0))
                sses += [new_ss.set_index(['trumpCard', 'bidCode'])[0]]
            ss = pd.concat(sses)
    
        for t in range(0, 13):
            for code in range(2 ** N):
                if (t, code) not in ss.index:
                    ss.loc[t, code] = 13
            
        ss.sort_index(inplace=True)
        ss = ss.map(card_names).unstack('bidCode').sum(axis=1)
        
        os.makedirs(output_fname.rsplit('/', 1)[0], exist_ok=True)
        with open(output_fname, 'w') as f:
            for row in ss:
                f.write(row + '\n')
