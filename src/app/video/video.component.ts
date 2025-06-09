import { AfterViewInit, Component, ElementRef, OnDestroy, input, viewChild, effect } from '@angular/core';
import { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client';
import { NgClass } from '@angular/common';

@Component({
    selector: 'video-component',
    standalone: true,
    imports: [NgClass],
    templateUrl: './video.component.html',
    styles: [`

        .participant-data {
            position: absolute;
            bottom: 8px;
            left: 8px;
            z-index: 2;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.8rem;
        }

        /* Smaller text for thumbnails */
        .thumbnail-video .participant-data {
            font-size: 0.7rem;
            padding: 2px 6px;
            /*bottom: 4px;*/
            left: 4px;
        }

        .participant-data p {
            margin: 0;
        }

        video {
            width: 100%;
            height: 100%;
        }

        /* Ensure video covers thumbnail area properly */
        .thumbnail-video video {
            object-fit: cover;
        }
    `]
})
export class VideoComponent implements AfterViewInit, OnDestroy {
    videoElement = viewChild<ElementRef<HTMLVideoElement>>('videoElement');

    track = input.required<LocalVideoTrack | RemoteVideoTrack>();
    participantIdentity = input.required<string>();
    local = input(false);
    isMainVideo = input(false);
    isPreview = input(false);
    isThumbnail = input(false); // New input property

    constructor() {
        // Watch for track changes and reattach
        effect(() => {
            const track = this.track();
            const videoEl = this.videoElement();

            if (videoEl && track) {
                console.log('Attaching track:', track.sid, 'Source:', track.source);
                this.attachTrack();
            }
        });
    }

    ngAfterViewInit() {
        this.attachTrack();
    }

    private attachTrack() {
        const videoEl = this.videoElement();
        const track = this.track();

        if (videoEl && track) {
            // Detach any existing track first
            if (videoEl.nativeElement.srcObject) {
                track.detach(videoEl.nativeElement);
            }

            // Attach the new track
            track.attach(videoEl.nativeElement);

            // Debug logging
            console.log('Track attached:', track.sid);
            console.log('Video element srcObject:', videoEl.nativeElement.srcObject);
            console.log('MediaStreamTrack:', track.mediaStreamTrack);
            console.log('Track enabled:', track.mediaStreamTrack?.enabled);
            console.log('Track readyState:', track.mediaStreamTrack?.readyState);

            // Ensure video plays
            videoEl.nativeElement.play().catch(err => {
                console.warn('Video play failed:', err);
            });
        }
    }

    getObjectFit(): string {
        const track = this.track();

        // For thumbnails, always use 'cover' to fill the space nicely
        if (this.isThumbnail()) {
            return 'cover';
        }

        // Use 'contain' for screen shares to show full content
        if (track.source === 'screen_share') {
            return 'contain';
        }

        // Use 'cover' for camera feeds
        return this.isPreview() ? 'cover' : 'contain';
    }

    // New method to get CSS classes for the container
    getContainerClasses(): string {
        const classes = ['video-container'];

        if (this.isMainVideo()) {
            classes.push('main-video');
        } else if (this.isPreview()) {
            classes.push('preview-video');
        } else if (this.isThumbnail()) {
            classes.push('thumbnail-video'); // New class for thumbnails
        } else {
            classes.push('remote-video');
        }

        return classes.join(' ');
    }

    ngOnDestroy() {
        const videoEl = this.videoElement();
        if (videoEl) {
            this.track().detach(videoEl.nativeElement);
        }
    }
}
