from _oh_hell import generate_spreadsheet
import os

D = 1
iter = 'test'

for N in range(4, 11):
    print(f'N = {N}')
    fname = f'C:/Users/campb/data/oh_hell/{iter}/spreadsheet/N{N}_D{D}.txt'
    os.makedirs(fname.rsplit('/', 1)[0], exist_ok=True)
    generate_spreadsheet(N, D, fname)