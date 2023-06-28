import numpy as np
import sys

iter = 'no_w_fit_5'
job = 'fit'
process_loop = True
process_count = 1000
exploration_count = 0
greeds = np.concatenate([
    np.linspace(0.5, 0.95, exploration_count),
    np.full(process_count - exploration_count, 0.99)
])
group_count = 10

def run_process_loop():
    print('Starting process loop...')
    import subprocess

    for i, greed in enumerate(greeds):
        subprocess.run(f'{sys.prefix}/Scripts/activate & python {sys.argv[0]} {i} {greed}', shell=True, check=True)

def run_fit():
    import euchre

    process_num = int(sys.argv[1]) if len(sys.argv) > 1 else -1
    process_greed = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
    print(f'Running process {process_num} with greed {process_greed}')
    workshop = euchre.EuchreCoreMarkovWorkshop(
        iter=iter,
        log_rule=None, # lambda i: i == 1, 
        max_rounds=0,
        load=True # process_num > 0
    )
    workshop.run(
        group_count=group_count,
        fit=True,
        save=True,
        group_size=50,
        game_log=True,
        epochs_per_fit=1,
        group_fit_window=1,
        groups_per_evaluation=group_count,
        groups_per_evaluation_data=1,
        evaluation_size=100,
        evaluation_log=True,
        groups_per_save_data=group_count,
        batch_size=32,
        greeds=[process_greed] * group_count,
        num_processes=10
    )

def run_test():
    import euchre

    workshop = euchre.EuchreCoreMarkovWorkshop(
        iter=iter,
        log_rule = lambda i: i == 1, 
        max_rounds=1,
        load=True,
    )
    workshop.run(
        group_count=1,
        game_log=True,
        fit=False,
        save=False,
        group_size=1,
        greeds=[1.0, 1.0, 1.0, 1.0],
        num_processes=1,
    )

if __name__ == '__main__':
    if job == 'fit' and process_loop and len(sys.argv) == 1:
        run_process_loop()
    elif job == 'fit':
        run_fit()
    elif job == 'test':
        run_test()