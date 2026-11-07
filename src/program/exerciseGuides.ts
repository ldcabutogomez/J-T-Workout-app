export interface ExerciseGuide {
  setup: string[];
  execution: string[];
  cues: string[];
  mistakes: string[];
  videoUrl: string;
  demo?: { url: string; alt: string; credit: string; creditUrl: string };
}

const videoSearch = (name: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(`Renaissance Periodization ${name} technique`)}`;

const base = (name: string): ExerciseGuide => ({
  setup: ['Choose a load you can control through the full range of motion.', 'Set the equipment so the first rep starts from a stable position.'],
  execution: ['Brace before the rep and move through a comfortable, controlled range.', 'Keep the working joints aligned and finish without bouncing or jerking.'],
  cues: ['Control the lowering phase.', 'Keep tension on the target muscles.', 'Stop if you feel sharp pain.'],
  mistakes: ['Using momentum to finish reps.', 'Shortening the range as fatigue rises.', 'Adding load before the movement is repeatable.'],
  videoUrl: videoSearch(name),
});

const squat: ExerciseGuide = {
  setup: ['Place the bar securely across the upper back and set both feet before unracking.', 'Use a stance that lets the knees track over the toes while the whole foot stays planted.'],
  execution: ['Brace, sit down between the hips, and keep the bar balanced over mid-foot.', 'Reach a controlled depth, then drive the floor away while the chest and hips rise together.'],
  cues: ['Tripod foot.', 'Knees follow toes.', 'Brace before every rep.'],
  mistakes: ['Heels or toes lifting.', 'Relaxing at the bottom.', 'Hips shooting up before the chest.'],
  videoUrl: 'https://www.youtube.com/watch?v=fPc-Zjjjj1A',
  demo: { url: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Squat-CDC%20strength%20training%20for%20older%20adults.gif', alt: 'Looped squat demonstration', credit: 'CDC strength-training animation, public domain', creditUrl: 'https://commons.wikimedia.org/wiki/File:Squat-CDC_strength_training_for_older_adults.gif' },
};

const deadlift: ExerciseGuide = {
  setup: ['Stand with the bar over mid-foot and take a balanced grip just outside the legs.', 'Bring the shins to the bar, brace, and pull the slack out before leaving the floor.'],
  execution: ['Push the floor away while keeping the bar close.', 'Stand tall without leaning back, then return the bar under control.'],
  cues: ['Wedge in.', 'Long arms.', 'Bar close all the way.'],
  mistakes: ['Jerking a loose bar from the floor.', 'Letting the bar drift forward.', 'Hyperextending at lockout.'],
  videoUrl: videoSearch('deadlift'),
  demo: { url: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Man%20Lifting%20Barbell%20Deadlift%20GIF%20Animation%20Loop.gif', alt: 'Looped deadlift demonstration', credit: 'Videoplasty.com, CC BY-SA 4.0', creditUrl: 'https://commons.wikimedia.org/wiki/File:Man_Lifting_Barbell_Deadlift_GIF_Animation_Loop.gif' },
};

const bench: ExerciseGuide = {
  setup: ['Set your eyes under the bar, plant the feet, and pin the upper back to the bench.', 'Use a grip that keeps the wrists stacked over the forearms near the chest.'],
  execution: ['Unrack over the shoulders, lower with control to the lower chest, then press back and slightly toward the rack.', 'Keep the shoulders set and use steady leg drive.'],
  cues: ['Bend the bar.', 'Chest up.', 'Wrists over elbows.'],
  mistakes: ['Shoulders rolling forward.', 'Bar landing too high.', 'Losing foot pressure during the press.'],
  videoUrl: videoSearch('bench press'),
};

const press: ExerciseGuide = {
  setup: ['Grip just outside shoulder width with forearms vertical.', 'Brace the glutes and trunk before the bar leaves the shoulders.'],
  execution: ['Move the head slightly back, press the bar vertically, then bring the head through at lockout.', 'Lower to the same stable starting point.'],
  cues: ['Ribs down.', 'Bar close.', 'Finish over mid-foot.'],
  mistakes: ['Leaning back into an incline press.', 'Pressing around the face in a wide arc.', 'Relaxing between reps.'],
  videoUrl: videoSearch('overhead press'),
};

export function guideFor(exerciseId: string, exerciseName: string): ExerciseGuide {
  if (/deadlift|rack-pull|romanian|stiff-leg/.test(exerciseId)) return deadlift;
  if (/squat|leg-press|hack-squat|lunge|split-squat/.test(exerciseId)) return squat;
  if (/bench|chest-press|push-up|dip/.test(exerciseId)) return bench;
  if (/military|shoulder-press|push-press/.test(exerciseId)) return press;
  return base(exerciseName);
}
