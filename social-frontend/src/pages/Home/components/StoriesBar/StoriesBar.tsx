// src/pages/Home/components/StoriesBar/StoriesBar.tsx
import { stories } from '../../mock'
import styles from './StoriesBar.module.css'
import { useModal } from '../../../../components/Modal'
import StoryViewer from './StoryViewer'

export default function StoriesBar() {
    const modal = useModal()

    return (
        <div className={styles.wrap}>
            {stories.map((s) => (
                <button
                    key={s.id}
                    className={styles.storyBtn}

                    onClick={() => {
                        console.log(15);
                        // debugger
                        modal.openFullscreen(<StoryViewer startStoryId={s.id} />)
                    }}
                >
                    <div className={styles.story}>
                        <div className={styles.ring}>
                            <img className={styles.avatar} src={s.avatar} alt={s.name} />
                        </div>
                        <div className={styles.name}>{s.name}</div>
                    </div>
                </button>
            ))}
        </div>
    )
}