import numpy as np

import hearts

count = 100
workshop = hearts.HeartsAiModuleMarkovWorkshop(3, False)
workshop.run(
    count=count,
    games_per_fit=3,
    epochs_per_fit=3,
    greeds=np.linspace(0.0, 1.0, count)
)

#workshop = hearts.HeartsAiModuleMarkovWorkshop(
#    3, 
#    False, 
#    log=True, 
#    log_rule=lambda i: i == 0,
#    max_rounds=1
#)
#workshop.run(
#    count=1,
#    fit=False
#)