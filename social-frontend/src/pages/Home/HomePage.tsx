import StoriesBar from "./components/StoriesBar/StoriesBar";
import Feed from "./components/Feed/Feed";
import RightPanel from "../../components/layout/RightPanel/RightPanel";
import styles from "./HomePage.module.css";

export default function HomePage() {
    return (
        <div className={styles.wrapper}>
            <div className={styles.center}>
                <StoriesBar />
                <Feed />
            </div>

            <aside className={styles.right}>
                <RightPanel />
            </aside>
        </div>
    );
}