import StoriesBar from "./components/StoriesBar/StoriesBar";
import Feed from "./components/Feed/Feed";
import RightPanel from "../../components/layout/RightPanel/RightPanel";
import styles from "./HomePage.module.css";

export default function HomePage() {
    return (
        <div className={`${styles.wrapper} home-page__wrapper`}>
            <div className={`${styles.center} home-page__center`}>
                <StoriesBar />
                <Feed />
            </div>

            {/* <aside className={styles.right}>
                <RightPanel />
            </aside> */}
        </div>
    );
}
