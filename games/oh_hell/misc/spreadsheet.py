from _oh_hell import generate_spreadsheet
import os

D = 2
iter = 'test'

# x2 = 7.879 # Confidence p = 0.005
x2 = 15.13670523 # Confidence p = 0.0001
# x2 = 19.51142096464506 # Confidence p = 0.00001

for N in range(4, 11):
    print(f'N = {N}')
    fname = f'C:/Users/campb/data/oh_hell/{iter}/spreadsheet/N{N}_D{D}.txt'
    os.makedirs(fname.rsplit('/', 1)[0], exist_ok=True)
    generate_spreadsheet(N, D, x2, fname, False)