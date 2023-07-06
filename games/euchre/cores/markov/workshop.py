import numpy as np
import os
import pandas as pd
import sys
import time

from _euchre import EuchreConfig
from euchre.cores.markov.core_markov import EuchreCoreMarkov, create_euchre_core_markov
#from euchre.cores.markov.local_runner import LocalRunner
from euchre.cores.markov.models import NNModels
from games.local_runner import LocalRunner

from tools import hdf5

euchre_dir = 'C:/Users/campb/data/euchre'

class EuchreCoreMarkovWorkshop:
    def __init__(self, stick_the_dealer=True, log_rule=None, iter=None, max_rounds=0, load=True, seed=None):
        iter = iter or 'base'
        self.iter = iter
        self.load = load
        self.models = None
        
        seed = seed or int(time.time())
        self.runner_config = {
            'factory': create_euchre_core_markov,
            'args_list': [stick_the_dealer, max_rounds, seed]
        }
        self.config = EuchreConfig(*self.runner_config['args_list'])
        
        self.log_rule = None
        if log_rule is not None:
            self.log_rule = [log_rule(i) for i in range(self.config.N)]

        self.runners = []
        self.ready_runners = set()

    def create_runner(self, write_schema):
        if self.models is None:
            self.create_models(write_schema)

        runner = LocalRunner(f'runner_{len(self.runners)}', self, self.runner_config)
        runner.start()
        self.runners += [runner]

        if self.log_rule is not None:
            runner.core_command('set_log_rule', log_rule_array=self.log_rule)
            #runner.set_log_rule(self.log_rule)

        runner.wait_until_ready()

        runner.core_command('set_models', raw_models=self.models.get_raw_models())
        #runner.set_models(self.models)

    def create_models(self, write_schema):
        self.models = NNModels()
        dummy_core = EuchreCoreMarkov(self.config)
        dummy_core.initialize()
        if self.load:
            self.models.load(self.model_dir)
        else:
            self.models.generate(dummy_core)
        self.models.load_schema(dummy_core, self.history_fname if write_schema else None)

    @property
    def base_dir(self):
        return f'{euchre_dir}/{self.iter}/{int(self.config.stickTheDealer)}'

    @property
    def log_dir(self):
        return f'{self.base_dir}/logs'

    @property
    def model_dir(self):
        return f'{self.base_dir}/models'

    @property
    def web_dir(self):
        return f'{sys.prefix}/../web/models/euchre'

    @property
    def history_fname(self):
        return f'{self.base_dir}/history.h5'

    def run_one_game(self, name, log=None, greeds=None, max_running=1, is_evaluation=False, write_schema=False):
        while len(self.ready_runners) == 0:
            if len(self.runners) < max_running:
                self.create_runner(write_schema)
            else:
                time.sleep(0.001)

        runner = self.ready_runners.pop()
        runner.core_command('run', game_name=name, log=log, greeds=greeds, is_evaluation=is_evaluation)
        #runner.run(name, log, greeds, is_evaluation)

    def wait_for_runners(self):
        while len(self.ready_runners) != len(self.runners):
            time.sleep(0.001)

    def run(
        self, 
        group_count=1, 
        game_log=False,
        fit=True, 
        group_size=1, 
        epochs_per_fit=1, 
        group_fit_window=1, 
        groups_per_evaluation=0, 
        evaluation_size=1, 
        evaluation_log=False,
        groups_per_save_data=0, 
        groups_per_evaluation_data=0, 
        batch_size=None, 
        greeds=None, 
        save=False, 
        groups_per_save_to_web=0, 
        num_processes=1
    ):
        if game_log or evaluation_log:
            os.makedirs(self.log_dir, exist_ok=True)

        write_schema = groups_per_save_data > 0 or groups_per_evaluation_data > 0

        for f in range(group_count):
            # Set greeds
            greed = greeds[f] if greeds is not None else 1.0
            group_greeds = [greed] * self.config.N

            # Play games
            print(f"Game group {f}: greed = {greed}")
            for g in range(group_size):
                name = f'{f}.{g}'
                log = None
                if game_log:
                    log = f'{self.log_dir}/game.{name}.txt'
                self.run_one_game(name, log, group_greeds, num_processes, False, write_schema)
            self.wait_for_runners()

            # Gather data
            save_data = groups_per_save_data > 0 and (f + 1) % groups_per_save_data == 0
            if fit or save_data:
                print('Gathering data...')
                for runner in self.runners:
                    self.ready_runners.remove(runner)
                    runner.core_command('gather_data')
                self.wait_for_runners()
                self.models.take_data([runner.get_return_data() for runner in self.runners])
                if save_data:
                    print('Writing data...')
                    self.models.write_data(self.history_fname)
            else:
                for runner in self.runners:
                    self.ready_runners.remove(runner)
                    runner.core_command('clearData')
                self.wait_for_runners()

            # Fit models
            if fit:
                if f >= group_fit_window - 1:
                    self.models.fit(epochs_per_fit, batch_size)
                    if save:
                        self.models.save(self.model_dir)
                        self.models.write_history(self.history_fname)
                    self.models.pop_data()
                    # Update runners' models
                    for runner in self.runners:
                        runner.core_command('set_models', raw_models=self.models.get_raw_models())
                    self.wait_for_runners()

            # Evaluate
            if groups_per_evaluation > 0 and (f + 1) % groups_per_evaluation == 0:
                print('Evaluation:')
                scores = pd.DataFrame(columns=['index', 'rotation', 'team', 'score']).set_index(['index', 'rotation', 'team']).score
                num_rotations = self.config.N // 2
                for rotation in range(num_rotations):
                    rotated_greeds = [1.0 if i % num_rotations == rotation else 0.0 for i in range(self.config.N)]
                    for h in range(evaluation_size):
                        name = f'{f}.{rotation}.{h}'
                        log = None
                        if evaluation_log:
                            log = f'{self.log_dir}/evaluation.{name}.txt'
                        self.run_one_game(name, log, rotated_greeds, num_processes, True, write_schema)
                    self.wait_for_runners()
                    all_scores = []
                    for runner in self.runners:
                        ret = runner.get_return_data()
                        if ret is not None:
                            all_scores += [ret]
                    for h, runner_scores in enumerate(all_scores):
                        for team, score in enumerate(runner_scores):
                            scores.loc[h, rotation, team] = score
                scores = scores.reset_index()
                scores['rotated_team'] = (scores.team + num_rotations - scores.rotation) % num_rotations
                scores = scores.set_index(['rotation', 'index', 'rotated_team']).score.unstack(2)
                scores.columns = [f'score_{i}' for i in scores]
                scores['win'] = scores.score_0.eq(scores.max(axis=1)).astype(int)
                scores = scores.unstack(0).describe().T
                print(scores)
                scores = scores.stack()
                scores.index = ['_'.join(map(str, i)) for i in scores.index]
                scores = scores.to_frame().T

                if save:
                    hdf5.write_table(scores, self.history_fname, 'evaluation', mode='a')

            # Evaluation data
            if save and groups_per_evaluation_data > 0 and (f + 1) % groups_per_evaluation_data == 0:
                print('Evaluating data...')
                self.models.evaluate_data(self.history_fname)

            # Save to web
            if groups_per_save_to_web > 0 and (f + 1) % groups_per_save_to_web == 0:
                print('Saving to web...')
                self.models.save_for_web(self.web_dir)

        for runner in self.runners:
            runner.end()

### main

iter = 'no_w_fit_7'
job = 'fit'
process_loop = True
process_count = 1000
exploration_count = 0
greeds = np.concatenate([
    np.linspace(0, 0.95, exploration_count),
    np.full(process_count - exploration_count, 0.95)
])
group_count = 100

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
        log_rule=None,
        max_rounds=0,
        load=os.path.exists(f'C:/Users/campb/data/euchre/{iter}/1/models/rnn')
    )
    workshop.run(
        group_count=group_count,
        fit=True,
        save=True,
        group_size=10,
        game_log=False,
        epochs_per_fit=1,
        group_fit_window=1,
        groups_per_evaluation=group_count,
        groups_per_evaluation_data=1,
        evaluation_size=10,
        evaluation_log=False,
        #groups_per_save_data=group_count,
        groups_per_save_to_web=group_count,
        batch_size=32,
        greeds=[process_greed] * group_count,
        num_processes=10
    )

def run_test():
    import euchre

    workshop = euchre.EuchreCoreMarkovWorkshop(
        iter=iter,
        log_rule = lambda i: False, 
        max_rounds=0,
        load=True,
        seed=420
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

def regression_test():
    import euchre

    workshop = euchre.EuchreCoreMarkovWorkshop(
        iter=iter,
        log_rule = lambda i: True, 
        max_rounds=0,
        load=True,
        seed=420
    )
    workshop.run(
        group_count=1,
        game_log=True,
        fit=False,
        save=False,
        group_size=1,
        greeds=[1.0, 1.0, 1.0, 1.0],
        num_processes=1,
        groups_per_evaluation_data=1,
        groups_per_save_data=1,
    )

if __name__ == '__main__':
    if job == 'fit' and process_loop and len(sys.argv) == 1:
        run_process_loop()
    elif job == 'fit':
        run_fit()
    elif job == 'test':
        run_test()
    elif job == 'regression':
        regression_test()